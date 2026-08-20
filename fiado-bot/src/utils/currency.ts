const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(cents: number): string {
  return brlFormatter.format(cents / 100);
}

export function reaisToCents(amount: number): number {
  return Math.round(amount * 100);
}
