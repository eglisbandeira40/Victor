import { z } from "zod";

export const cadastroSchema = z.object({
  empresaNome: z.string().min(2, "Informe o nome da empresa"),
  nome: z.string().min(2, "Informe seu nome"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
});

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

export const clienteSchema = z.object({
  nome: z.string().min(2, "Informe o nome do cliente"),
  documento: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  telefone: z.string().optional(),
});

export const contaPagarSchema = z.object({
  descricao: z.string().min(2, "Informe a descrição"),
  categoria: z.string().optional(),
  fornecedor: z.string().optional(),
  valor: z.coerce.number().positive("Valor deve ser positivo"),
  dataVencimento: z.string().min(1, "Informe a data de vencimento"),
});

export const contaReceberSchema = z.object({
  clienteId: z.string().min(1, "Selecione um cliente"),
  descricao: z.string().min(2, "Informe a descrição"),
  valor: z.coerce.number().positive("Valor deve ser positivo"),
  dataVencimento: z.string().min(1, "Informe a data de vencimento"),
  reguaCobrancaId: z.string().optional(),
  emitirCobranca: z.coerce.boolean().optional(),
  tipoCobranca: z.enum(["BOLETO", "PIX"]).optional(),
});

export const reguaCobrancaSchema = z.object({
  nome: z.string().min(2, "Informe o nome da régua"),
  padrao: z.coerce.boolean().optional(),
});

export const reguaEtapaSchema = z.object({
  diasOffset: z.coerce.number(),
  canal: z.enum(["EMAIL", "WHATSAPP", "SMS"]),
  assunto: z.string().min(2, "Informe o assunto"),
  mensagemTemplate: z.string().min(2, "Informe a mensagem"),
});

export const gatewayOnboardingSchema = z.object({
  nome: z.string().min(2, "Informe a razão social"),
  cpfCnpj: z.string().min(11, "Informe um CPF ou CNPJ válido"),
  email: z.string().email("E-mail inválido"),
  telefone: z.string().min(8, "Informe um telefone"),
  dataNascimentoOuFundacao: z.string().min(1, "Informe a data"),
  endereco: z.string().min(2, "Informe o endereço"),
  numeroEndereco: z.string().min(1, "Informe o número"),
  complemento: z.string().optional(),
  bairro: z.string().min(1, "Informe o bairro"),
  cep: z.string().min(8, "Informe o CEP"),
  faturamentoMensal: z.coerce.number().positive("Informe o faturamento mensal estimado"),
});
