import { differenceInCalendarDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { enviarEmailCobranca } from "@/lib/email";
import { formatBRL, formatDate } from "@/lib/format";

function preencherTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * Roda a régua de cobrança: marca contas vencidas como ATRASADO e dispara os
 * envios cujo dia (relativo ao vencimento) coincide com hoje. Idempotente -
 * cada (contaReceber, etapa) só gera um EnvioCobranca via constraint única.
 */
export async function executarReguaCobranca() {
  const hoje = startOfDay(new Date());

  await prisma.contaReceber.updateMany({
    where: { status: "PENDENTE", dataVencimento: { lt: hoje } },
    data: { status: "ATRASADO" },
  });

  const contas = await prisma.contaReceber.findMany({
    where: { status: { in: ["PENDENTE", "ATRASADO"] } },
    include: {
      cliente: true,
      empresa: true,
      reguaCobranca: { include: { etapas: true } },
      envios: true,
    },
  });

  let enviados = 0;
  let falhas = 0;

  for (const conta of contas) {
    const regua =
      conta.reguaCobranca ??
      (await prisma.reguaCobranca.findFirst({
        where: { empresaId: conta.empresaId, padrao: true, ativo: true },
        include: { etapas: true },
      }));

    if (!regua || !regua.ativo) continue;

    const diasRelativos = differenceInCalendarDays(hoje, conta.dataVencimento);
    const jaEnviadas = new Set(conta.envios.map((e) => e.etapaId));

    for (const etapa of regua.etapas) {
      if (etapa.diasOffset !== diasRelativos) continue;
      if (jaEnviadas.has(etapa.id)) continue;
      if (!conta.cliente.email) continue;

      const vars = {
        cliente: conta.cliente.nome,
        descricao: conta.descricao,
        valor: formatBRL(Number(conta.valor)),
        vencimento: formatDate(conta.dataVencimento),
        empresa: conta.empresa.nome,
      };

      try {
        await enviarEmailCobranca({
          to: conta.cliente.email,
          subject: preencherTemplate(etapa.assunto, vars),
          html: preencherTemplate(etapa.mensagemTemplate, vars).replace(
            /\n/g,
            "<br/>"
          ),
        });

        await prisma.envioCobranca.create({
          data: {
            contaReceberId: conta.id,
            etapaId: etapa.id,
            canal: etapa.canal,
            destinatario: conta.cliente.email,
            status: "ENVIADO",
          },
        });
        enviados++;
      } catch (err) {
        await prisma.envioCobranca.create({
          data: {
            contaReceberId: conta.id,
            etapaId: etapa.id,
            canal: etapa.canal,
            destinatario: conta.cliente.email,
            status: "FALHA",
            erro: err instanceof Error ? err.message : "Erro desconhecido",
          },
        });
        falhas++;
      }
    }
  }

  return { enviados, falhas, contasAvaliadas: contas.length };
}
