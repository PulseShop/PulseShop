import type { Merchant, Product } from "@/types";
import type { OrderChannel } from "@/types";
import { formatKes, hasPriceRange, minVariantPrice, variantPrice } from "./currency";
import { variantLabel } from "./variant";
import { productUrl } from "./productUrl";

/**
 * Pre-filled "ask about this product" links for the detail page contact icons —
 * only for channels the seller actually set up, so unconfigured ones don't
 * render as dead buttons.
 */
export function productInquiryLinks(merchant: Merchant, product: Product) {
  const from = hasPriceRange(product) ? "from " : "";
  const msg = `Hi ${merchant.name}! I'm interested in "${product.name}" (${product.sku}) — ${from}${formatKes(
    minVariantPrice(product),
  )}. Is it available?`;
  const links: { channel: OrderChannel; url: string }[] = [];
  if (merchant.contacts.whatsapp)
    links.push({ channel: "whatsapp", url: `https://wa.me/${merchant.contacts.whatsapp}?text=${encodeURIComponent(msg)}` });
  if (merchant.contacts.instagram)
    links.push({ channel: "instagram", url: `https://ig.me/m/${merchant.contacts.instagram}` });
  if (merchant.contacts.facebook)
    links.push({ channel: "facebook", url: `https://m.me/${merchant.contacts.facebook}` });
  return links;
}

/** Pre-filled order message for SEND ORDER. */
export function orderLink(
  merchant: Merchant,
  product: Product,
  opts: {
    size: string | null;
    color: string | null;
    qty: number;
    name: string;
    phone: string;
    notes: string;
  },
  channel: Exclude<OrderChannel, "direct">,
  reference: string,
) {
  // The variant's price, not the base — this line is what the seller collects
  // money against, so it has to match what place_order charged.
  const price = variantPrice(product, opts.size, opts.color);
  const lines = [
    `🛍️ New order for ${merchant.name}`,
    ``,
    `• ${product.name} (${product.sku})`,
    opts.size ? `• Size: ${opts.size}` : null,
    opts.color ? `• Colour: ${opts.color}` : null,
    `• Qty: ${opts.qty}`,
    `• Total: ${formatKes(price * opts.qty)}`,
    ``,
    `Ref: ${reference}`,
    `Name: ${opts.name}`,
    `Phone: ${opts.phone}`,
    opts.notes ? `Notes: ${opts.notes}` : null,
  ].filter((l): l is string => l !== null);
  const msg = lines.join("\n");

  // ig.me/m.me can't prefill a message the way wa.me does — callers should
  // copy `message` to the clipboard before opening `url` for those channels.
  const url =
    channel === "whatsapp"
      ? `https://wa.me/${merchant.contacts.whatsapp}?text=${encodeURIComponent(msg)}`
      : channel === "instagram"
        ? `https://ig.me/m/${merchant.contacts.instagram}`
        : `https://m.me/${merchant.contacts.facebook}`;
  return { url, message: msg };
}

/** Pre-filled order message for a multi-item cart checkout. */
export function cartOrderLink(
  merchant: Merchant,
  items: { name: string; size: string | null; color: string | null; qty: number; unitPrice: number }[],
  opts: { name: string; phone: string; notes: string },
  channel: Exclude<OrderChannel, "direct">,
  reference: string,
) {
  const total = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
  const lines = [
    `🛍️ New order for ${merchant.name}`,
    ``,
    ...items.map(
      (i) =>
        `• ${i.name}${variantLabel(i.size, i.color) ? ` (${variantLabel(i.size, i.color)})` : ""} × ${
          i.qty
        } — ${formatKes(i.unitPrice * i.qty)}`,
    ),
    ``,
    `Total: ${formatKes(total)}`,
    ``,
    `Ref: ${reference}`,
    `Name: ${opts.name}`,
    `Phone: ${opts.phone}`,
    opts.notes ? `Notes: ${opts.notes}` : null,
  ].filter((l): l is string => l !== null);
  const msg = lines.join("\n");

  const url =
    channel === "whatsapp"
      ? `https://wa.me/${merchant.contacts.whatsapp}?text=${encodeURIComponent(msg)}`
      : channel === "instagram"
        ? `https://ig.me/m/${merchant.contacts.instagram}`
        : `https://m.me/${merchant.contacts.facebook}`;
  return { url, message: msg };
}

export function merchantChatLink(merchant: Merchant) {
  const msg = `Hi ${merchant.name}! 👋`;
  return `https://wa.me/${merchant.contacts.whatsapp}?text=${encodeURIComponent(msg)}`;
}

/**
 * "Share this product" links — for promoting a product's own page (e.g. a
 * seller posting their new listing), not for asking the seller a question.
 * Facebook and WhatsApp both support a generic sharer URL that doesn't need
 * anyone's contact details; Instagram has no web share endpoint at all, so
 * callers fall back to copying `url` for the seller to paste into a bio/Story.
 */
export function productShareLinks(product: Product) {
  const url = productUrl(product);
  const caption = `Check out ${product.name} — ${
    hasPriceRange(product) ? "from " : ""
  }${formatKes(minVariantPrice(product))} on PulseShop!`;
  return {
    url,
    caption,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${caption} ${url}`)}`,
  };
}

/**
 * Only the social links the seller actually set up, so the UI can render
 * buttons for those and skip the rest entirely.
 */
export function merchantSocialLinks(merchant: Merchant) {
  const links: { channel: OrderChannel; url: string }[] = [];
  if (merchant.contacts.whatsapp) links.push({ channel: "whatsapp", url: merchantChatLink(merchant) });
  if (merchant.contacts.instagram)
    links.push({ channel: "instagram", url: `https://ig.me/m/${merchant.contacts.instagram}` });
  if (merchant.contacts.facebook)
    links.push({ channel: "facebook", url: `https://m.me/${merchant.contacts.facebook}` });
  return links;
}
