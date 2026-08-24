import { forwardRef } from "react";
import { formatKes, hasPriceRange, minVariantPrice } from "@/lib/currency";
import { ProductImage } from "@/components/product/ProductImage";
import { STATUS_HEIGHT, STATUS_WIDTH } from "@/lib/statusCard";
import type { Product } from "@/types";

/**
 * The WhatsApp Status card.
 *
 * A different graphic from InstagramStoryTemplate, and the difference is the
 * whole point: Instagram Stories carry a link sticker the seller places by
 * hand, so that template can say "tap the link below". WhatsApp Status carries
 * NOTHING tappable. A viewer who wants to buy has to read the address off the
 * screen and type it, or screenshot it and type it later.
 *
 * So the link is not a footnote here, it is the second-largest thing on the
 * card, set in a monospaced face at a size that survives a screenshot of a
 * screenshot. Everything else on the card exists to earn the two seconds it
 * takes to read it.
 *
 * The price is the other non-negotiable. "DM for price" is the most reliable
 * way to lose a Kenyan social shopper mid-scroll, so the number is committed
 * to up front.
 *
 * Styled with plain inline hex rather than Tailwind classes for the same
 * reason as the Story template: html2canvas cannot parse the
 * color-mix()/oklch() output Tailwind v4 emits, so these stay hand-styled to
 * rasterize reliably. The palette is fixed rather than theme-aware, because
 * this is an image posted to someone else's feed, not a surface in the app.
 */
export const CARD_BACKGROUND = "#0b1f1c";

export const StatusCardTemplate = forwardRef<
  HTMLDivElement,
  { product: Product; shopName: string; url: string }
>(function StatusCardTemplate({ product, shopName, url }, ref) {
  const hasDiscount = product.discountPct != null;
  const finalPrice = minVariantPrice(product);
  // A product with variant pricing has no single price, so the card promises
  // the floor and says so — quoting one variant's price as THE price is how a
  // seller ends up arguing with a buyer in the DMs.
  const pricePrefix = hasPriceRange(product) ? "from " : "";
  // Printed without the scheme: it is read aloud and typed, and nobody types
  // "https://".
  const displayUrl = url.replace(/^https?:\/\//, "");

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: 0,
        left: -9999,
        width: STATUS_WIDTH,
        height: STATUS_HEIGHT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "96px 72px",
        backgroundColor: CARD_BACKGROUND,
        backgroundImage: "linear-gradient(165deg, #0b1f1c 0%, #123f38 58%, #0b1f1c 100%)",
        fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: "#5eead4",
        }}
      >
        {shopName}
      </div>

      <div
        style={{
          marginTop: 56,
          width: 936,
          height: 936,
          borderRadius: 48,
          overflow: "hidden",
          backgroundColor: "#ffffff",
          boxShadow: "0 32px 80px rgba(0, 0, 0, 0.45)",
        }}
      >
        <ProductImage
          src={product.images[0]}
          crossOrigin="anonymous"
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>

      <div
        style={{
          marginTop: 52,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 62, fontWeight: 800, color: "#ffffff", lineHeight: 1.12 }}>
          {product.name}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          {hasDiscount && (
            <span
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: "#7f9c97",
                textDecoration: "line-through",
              }}
            >
              {formatKes(product.priceKes)}
            </span>
          )}
          <span style={{ fontSize: 78, fontWeight: 800, color: "#5eead4" }}>
            {pricePrefix}
            {formatKes(finalPrice)}
          </span>
        </div>
      </div>

      {/* The link block. Everything above it is the advert; this is the part
          that has to still be readable after WhatsApp has recompressed the
          image twice. */}
      <div
        style={{
          marginTop: "auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          padding: "44px 32px",
          borderRadius: 40,
          backgroundColor: "#ffffff",
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#cc785c",
          }}
        >
          Order here
        </div>
        <div
          style={{
            fontSize: 54,
            fontWeight: 800,
            color: "#0b1f1c",
            fontFamily: "ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', monospace",
            wordBreak: "break-all",
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          {displayUrl}
        </div>
      </div>
    </div>
  );
});
