/**
 * Normalizes a phone number to bare digits in the international form wa.me
 * links require (country code + number, no "+"). A leading "+" — or a
 * number that already starts with the Kenyan country code — is treated as
 * already-international and passed through untouched, so numbers from any
 * country work. Bare local-format shorthand (e.g. "0712345678",
 * "712345678") still defaults to +254, since most numbers entered in this
 * app so far are Kenyan and that shorthand is otherwise ambiguous.
 */
export function toWhatsAppDigits(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") || digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  return digits;
}

/**
 * Loose international phone check — accepts any country's number (optional
 * leading "+", spaces/dashes/parens allowed) rather than requiring a Kenyan
 * format. Not full E.164 validation, just a sane significant-digit range.
 */
export function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/** Strips a leading "@" or a full profile URL down to the bare handle. */
export function toSocialHandle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lastSegment = trimmed.includes("/")
    ? (trimmed.split("/").filter(Boolean).pop() ?? trimmed)
    : trimmed;
  return lastSegment.replace(/^@/, "");
}
