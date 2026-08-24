import { forwardRef } from "react";
import { formatKes, minVariantPrice } from "@/lib/currency";
import { ProductImage } from "@/components/product/ProductImage";
import type { Product } from "@/types";

const WIDTH = 1080;
const HEIGHT = 1920;

/**
 * Off-screen 9:16 canvas that html2canvas rasterizes into the downloadable
 * Story image. Meta blocks third-party apps from placing the link sticker
 * automatically, so this only gets the graphic ready — the seller still
 * pastes the (already-copied) product link onto it by hand inside Instagram.
 *
 * Styled with plain inline hex colors rather than Tailwind utility classes:
 * html2canvas can't parse the color-mix()/oklch() output Tailwind v4 emits
 * for opacity modifiers, so the template stays hand-styled to render reliably.
 */
export const InstagramStoryTemplate = forwardRef<HTMLDivElement, { product: Product; shopName: string }>(
  function InstagramStoryTemplate({ product, shopName }, ref) {
    const hasDiscount = product.discountPct != null;
    const finalPrice = minVariantPrice(product);

    return (
      <div
        ref={ref}
        style={{
          position: "fixed",
          top: 0,
          left: -9999,
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 56,
          padding: "0 80px",
          backgroundColor: "#fafaf9",
          backgroundImage: "linear-gradient(160deg, #ccfbf1 0%, #fafaf9 45%, #ffe4e6 100%)",
          fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: 880,
            height: 880,
            borderRadius: 40,
            overflow: "hidden",
            boxShadow: "0 24px 64px rgba(28, 25, 23, 0.22)",
            backgroundColor: "#ffffff",
          }}
        >
          <ProductImage
            src={product.images[0]}
            crossOrigin="anonymous"
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 72, fontWeight: 800, color: "#1c1917", lineHeight: 1.15 }}>
            {product.name}
          </h1>

          <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
            {hasDiscount && (
              <span style={{ fontSize: 44, fontWeight: 700, color: "#78716c", textDecoration: "line-through" }}>
                {formatKes(product.priceKes)}
              </span>
            )}
            <span style={{ fontSize: 64, fontWeight: 800, color: "#0d9488" }}>{formatKes(finalPrice)}</span>
          </div>
        </div>

        <div
          style={{
            marginTop: 24,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 28,
          }}
        >
          <div
            style={{
              padding: "28px 64px",
              backgroundColor: "#1c1917",
              color: "#ffffff",
              fontSize: 44,
              fontWeight: 700,
              borderRadius: 999,
            }}
          >
            Tap the link below to shop
          </div>
          <div style={{ fontSize: 40, color: "#78716c" }}>↓</div>
        </div>

        <div style={{ position: "absolute", bottom: 72, fontSize: 36, fontWeight: 700, color: "#a8a29e" }}>
          {shopName} on PulseShop
        </div>
      </div>
    );
  },
);
