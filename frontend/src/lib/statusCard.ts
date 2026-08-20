/**
 * Rasterizing an off-screen 9:16 template into a file the seller can post.
 *
 * Both share graphics (the Instagram Story and the WhatsApp Status card) come
 * down to the same three steps — measure a hidden DOM node at 1080x1920, turn
 * it into a PNG, hand it to the browser as a download — so they share this
 * rather than each carrying their own copy of the html2canvas incantation.
 *
 * html2canvas is imported dynamically: it is a large dependency that most
 * sessions never touch, and pulling it into the main bundle would cost every
 * shopper on a metered connection for a feature only sellers use.
 */
export const STATUS_WIDTH = 1080;
export const STATUS_HEIGHT = 1920;

/**
 * Render `node` to a PNG and start the download. Throws on failure so the
 * caller can tell the seller something went wrong rather than leaving them
 * waiting for a file that is never coming.
 *
 * `background` matters: html2canvas paints transparent pixels black by
 * default, which turns the rounded corners of a card into black wedges.
 */
export async function downloadCardImage(
  node: HTMLElement,
  fileName: string,
  background: string,
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(node, {
    width: STATUS_WIDTH,
    height: STATUS_HEIGHT,
    useCORS: true,
    backgroundColor: background,
  });
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  link.click();
}

/** A filename safe on every platform, derived from the seller's own SKU. */
export const cardFileName = (sku: string, suffix: string) =>
  `${sku.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${suffix}.png`;

/**
 * The caption that goes on the clipboard with the image.
 *
 * Written to be posted as-is. Two things earn their place: the price, because
 * "DM for price" is the single most common reason a Kenyan social shopper
 * scrolls past, and the link in full, because a Status viewer cannot tap
 * anything and has to be able to read it.
 */
export function statusCaption(opts: {
  productName: string;
  price: string;
  url: string;
  inStock: boolean;
}): string {
  const lines = [
    opts.inStock ? `${opts.productName} — ${opts.price}` : `${opts.productName} — back in stock soon`,
    "",
    "Order here:",
    opts.url,
  ];
  return lines.join("\n");
}
