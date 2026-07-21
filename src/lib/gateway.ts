import { prisma } from "@/lib/prisma";
import type { Cliente, Empresa } from "@/generated/prisma/client";

/**
 * "Gateway HubFinance" — camada de marca própria por cima de um processador
 * de pagamentos parceiro (hoje: Asaas, via o programa de sub-contas/White
 * Label). A empresa cliente do HubFinance nunca vê o nome do processador:
 * ela só enxerga "emitir cobrança" e a página de pagamento com a marca
 * HubFinance. Por baixo, cada Empresa tem sua própria sub-conta (KYC feito
 * uma vez em /configuracoes/gateway), e as cobranças são emitidas nela.
 *
 * Nota: os campos/endpoint de criação de sub-conta abaixo seguem a
 * documentação pública do Asaas (POST /accounts) até onde é possível
 * confirmar sem acesso à conta real - revise contra a documentação vigente
 * (https://docs.asaas.com) antes de ligar em produção.
 */

type TipoCobranca = "PIX" | "BOLETO";

export type DadosOnboardingGateway = {
  nome: string;
  cpfCnpj: string;
  email: string;
  telefone?: string;
  endereco: string;
  numeroEndereco: string;
  complemento?: string;
  bairro: string;
  cep: string;
  faturamentoMensal: number;
  dataNascimentoOuFundacao: string; // YYYY-MM-DD
};

function apiUrl() {
  return process.env.ASAAS_API_URL ?? "https://sandbox.asaas.com/api/v3";
}

function masterApiKey() {
  const apiKey = process.env.ASAAS_MASTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ASAAS_MASTER_API_KEY não configurada. É a chave da conta plataforma " +
        "do HubFinance, usada só para provisionar sub-contas dos clientes."
    );
  }
  return apiKey;
}

async function gatewayFetch<T>(
  accessToken: string,
  path: string,
  init: RequestInit
): Promise<T> {
  const response = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: accessToken,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gateway error (${response.status}): ${body}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Provisiona a sub-conta da Empresa no processador (uma vez, no onboarding).
 * Usa a chave master da plataforma - a Empresa nunca lida com essa chave.
 */
export async function provisionarContaGateway(
  empresaId: string,
  dados: DadosOnboardingGateway
) {
  await prisma.empresa.update({
    where: { id: empresaId },
    data: { gatewayStatus: "PENDENTE" },
  });

  try {
    const conta = await gatewayFetch<{
      id: string;
      apiKey: string;
      walletId: string;
    }>(masterApiKey(), "/accounts", {
      method: "POST",
      body: JSON.stringify({
        name: dados.nome,
        email: dados.email,
        cpfCnpj: dados.cpfCnpj,
        companyType: dados.cpfCnpj.length > 11 ? "LIMITED" : undefined,
        birthDate: dados.cpfCnpj.length <= 11 ? dados.dataNascimentoOuFundacao : undefined,
        phone: dados.telefone,
        address: dados.endereco,
        addressNumber: dados.numeroEndereco,
        complement: dados.complemento,
        province: dados.bairro,
        postalCode: dados.cep,
        incomeValue: dados.faturamentoMensal,
      }),
    });

    await prisma.empresa.update({
      where: { id: empresaId },
      data: {
        gatewayStatus: "ATIVO",
        gatewayAccountId: conta.id,
        gatewayApiKey: conta.apiKey,
        gatewayWalletId: conta.walletId,
      },
    });
  } catch (err) {
    await prisma.empresa.update({
      where: { id: empresaId },
      data: { gatewayStatus: "REJEITADO" },
    });
    throw err;
  }
}

async function findOrCreateGatewayCustomer(
  empresa: Empresa,
  cliente: Cliente
): Promise<string> {
  if (cliente.gatewayCustomerId) return cliente.gatewayCustomerId;
  if (!empresa.gatewayApiKey) {
    throw new Error("Empresa ainda não completou o onboarding do gateway.");
  }

  const customer = await gatewayFetch<{ id: string }>(
    empresa.gatewayApiKey,
    "/customers",
    {
      method: "POST",
      body: JSON.stringify({
        name: cliente.nome,
        cpfCnpj: cliente.documento ?? undefined,
        email: cliente.email ?? undefined,
        phone: cliente.telefone ?? undefined,
      }),
    }
  );

  await prisma.cliente.update({
    where: { id: cliente.id },
    data: { gatewayCustomerId: customer.id },
  });

  return customer.id;
}

type EmitirCobrancaInput = {
  contaReceberId: string;
  tipo: TipoCobranca;
  empresa: Empresa;
  cliente: Cliente;
  valor: number;
  dataVencimento: Date;
};

/**
 * Emite uma cobrança (boleto ou PIX) na sub-conta da Empresa e persiste o
 * registro local em Cobranca (com publicToken para a página de pagamento
 * com a marca HubFinance). Lança se a Empresa ainda não tiver uma sub-conta
 * ativa - o chamador decide como tratar (a ContaReceber continua válida).
 */
export async function emitirCobranca(input: EmitirCobrancaInput) {
  if (input.empresa.gatewayStatus !== "ATIVO" || !input.empresa.gatewayApiKey) {
    throw new Error(
      "Gateway de pagamento ainda não configurado para esta empresa. " +
        "Complete o cadastro em Configurações > Gateway de Pagamento."
    );
  }

  const apiKey = input.empresa.gatewayApiKey;
  const customerId = await findOrCreateGatewayCustomer(input.empresa, input.cliente);

  const payment = await gatewayFetch<{
    id: string;
    invoiceUrl: string;
    bankSlipUrl?: string;
    identificationField?: string;
  }>(apiKey, "/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType: input.tipo,
      value: input.valor,
      dueDate: input.dataVencimento.toISOString().slice(0, 10),
    }),
  });

  let qrCode: string | undefined;
  let qrCodeImagem: string | undefined;
  if (input.tipo === "PIX") {
    try {
      const pix = await gatewayFetch<{ payload: string; encodedImage: string }>(
        apiKey,
        `/payments/${payment.id}/pixQrCode`,
        { method: "GET" }
      );
      qrCode = pix.payload;
      qrCodeImagem = pix.encodedImage;
    } catch {
      // QR code é opcional; o link de pagamento continua válido sem ele.
    }
  }

  return prisma.cobranca.create({
    data: {
      contaReceberId: input.contaReceberId,
      tipo: input.tipo,
      gatewayProvider: "ASAAS",
      gatewayId: payment.id,
      linkPagamento: payment.bankSlipUrl ?? payment.invoiceUrl,
      linhaDigitavel: payment.identificationField,
      qrCode,
      qrCodeImagem,
      dataVencimento: input.dataVencimento,
    },
  });
}
