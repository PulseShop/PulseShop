/* See components/common/Logo.tsx for why this is a public path. */
const fallback = "/icons/main_logo.png";

export const PRODUCT_IMAGE_FALLBACK = fallback;

/** First product image, or the PulseShop placeholder if none was ever set. */
export function productImageSrc(images: string[] | null | undefined): string {
  return images?.[0] || PRODUCT_IMAGE_FALLBACK;
}
