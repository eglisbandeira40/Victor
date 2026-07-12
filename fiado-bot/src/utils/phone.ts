/** Normaliza um telefone brasileiro pra formato so-digitos com codigo do pais (ex: 5511987654321). */
export function normalizePhoneBR(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

export function buildWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
