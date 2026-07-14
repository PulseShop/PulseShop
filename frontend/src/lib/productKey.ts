/**
 * Product keys — the `sku` a product is identified by.
 *
 * Generated, never typed. A merchant-chosen code drifts into duplicates and
 * typos, and the key isn't just an internal id: it's quoted back to the buyer in
 * the WhatsApp order message (lib/deeplinks.ts) and shown in the inventory
 * table, so it has to be short, unique and unambiguous out loud.
 *
 * Eight characters drawn from letters *and* digits. The alphabet deliberately
 * drops the look-alikes — O/0, I/1/L — so a key read off one phone screen and
 * typed into another can't come out as a different key. That leaves 31 symbols:
 * 31^8 ≈ 850 billion combinations, which for one shop's catalogue means a
 * collision is a curiosity, not a risk (and ProductModal retries on the unique
 * index anyway, so even that curiosity is handled).
 */
const KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const PRODUCT_KEY_LENGTH = 8;

/** A fresh random product key, e.g. "K7M2QP9X". */
export function generateProductKey(): string {
  const draws = new Uint32Array(PRODUCT_KEY_LENGTH);
  crypto.getRandomValues(draws);

  let key = "";
  for (const draw of draws) key += KEY_ALPHABET[draw % KEY_ALPHABET.length];
  return key;
}
