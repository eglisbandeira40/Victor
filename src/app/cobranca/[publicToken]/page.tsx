import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatBRL, formatDate } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";

const STATUS_INFO: Record<
  string,
  { label: string; className: string }
> = {
  PENDENTE: { label: "Aguardando pagamento", className: "bg-zinc-100 text-zinc-700" },
  PAGO: { label: "Pago", className: "bg-emerald-100 text-emerald-700" },
  VENCIDO: { label: "Vencido", className: "bg-rose-100 text-rose-700" },
  CANCELADO: { label: "Cancelado", className: "bg-zinc-100 text-zinc-400" },
};

export default async function CobrancaPublicaPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const cobranca = await prisma.cobranca.findUnique({
    where: { publicToken },
    include: {
      contaReceber: { include: { cliente: true, empresa: true } },
    },
  });

  if (!cobranca) notFound();

  const { contaReceber } = cobranca;
  const status = STATUS_INFO[cobranca.status];
  const podePagar = cobranca.status === "PENDENTE" || cobranca.status === "VENCIDO";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold tracking-tight text-emerald-600">
            HubFinance
          </span>
          <p className="mt-1 text-sm text-zinc-500">
            Cobrança emitida por {contaReceber.empresa.nome}
          </p>
        </div>

        <div className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-zinc-500">{contaReceber.descricao}</p>
              <p className="text-2xl font-semibold text-zinc-900">
                {formatBRL(Number(contaReceber.valor))}
              </p>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${status.className}`}>
              {status.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-zinc-100 pt-4 text-sm">
            <div>
              <p className="text-zinc-400">Cliente</p>
              <p className="font-medium text-zinc-800">{contaReceber.cliente.nome}</p>
            </div>
            <div>
              <p className="text-zinc-400">Vencimento</p>
              <p className="font-medium text-zinc-800">
                {formatDate(cobranca.dataVencimento)}
              </p>
            </div>
          </div>

          {podePagar && (
            <div className="border-t border-zinc-100 pt-4">
              {cobranca.tipo === "PIX" ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-zinc-700">
                    Pague com PIX
                  </p>
                  {cobranca.qrCodeImagem && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:image/png;base64,${cobranca.qrCodeImagem}`}
                      alt="QR Code PIX"
                      className="mx-auto h-48 w-48 rounded-lg border border-zinc-200"
                    />
                  )}
                  {cobranca.qrCode && (
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={cobranca.qrCode}
                        className="w-full truncate rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-600"
                      />
                      <CopyButton value={cobranca.qrCode} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-zinc-700">
                    Pague com boleto
                  </p>
                  {cobranca.linhaDigitavel && (
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={cobranca.linhaDigitavel}
                        className="w-full truncate rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-600"
                      />
                      <CopyButton value={cobranca.linhaDigitavel} />
                    </div>
                  )}
                  {cobranca.linkPagamento && (
                    <a
                      href={cobranca.linkPagamento}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full rounded-lg bg-emerald-600 py-2 text-center text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Baixar boleto (PDF)
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {cobranca.status === "PAGO" && (
            <div className="rounded-lg bg-emerald-50 p-4 text-center text-sm text-emerald-700">
              Pagamento confirmado. Obrigado!
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400">
          Pagamento processado com segurança pelo HubFinance.
        </p>
      </div>
    </div>
  );
}
