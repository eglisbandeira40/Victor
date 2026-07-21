const styles: Record<string, string> = {
  PENDENTE: "bg-zinc-100 text-zinc-700",
  ATRASADO: "bg-rose-100 text-rose-700",
  PAGO: "bg-emerald-100 text-emerald-700",
  CANCELADO: "bg-zinc-100 text-zinc-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-medium ${
        styles[status] ?? styles.PENDENTE
      }`}
    >
      {status}
    </span>
  );
}
