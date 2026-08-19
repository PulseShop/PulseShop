import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PRODUCT_IMAGE_FALLBACK } from "@/lib/productImage";
import { ProductImage } from "./ProductImage";

export function Gallery({
  images,
  alt,
  imageAlts,
  frameClassName = "aspect-square",
  thumbnails = true,
  thumbnailsClassName,
  focusIndex,
}: {
  images: string[];
  /** Fallback description, used for any photo with no alt of its own. */
  alt: string;
  /**
   * Seller-written alt text, positionally aligned with `images` (migration
   * 0039). A missing or blank entry falls back to `alt` plus the photo's
   * position — "Product name, image 2" says nothing useful about the photo, but
   * it is still better than an empty alt, which tells a screen reader the image
   * is decorative when it is the entire product.
   */
  imageAlts?: string[];
  /** Sizes the image frame. Defaults to a square; pass a height to cap it. */
  frameClassName?: string;
  /** Thumbnail strip below the frame. Off on narrow screens, where the swipe
   *  track and its dot indicators already cover navigation. */
  thumbnails?: boolean;
  /** Extra classes on the thumbnail strip — e.g. responsive display toggles
   *  when a page wants thumbnails at some breakpoints but not others. */
  thumbnailsClassName?: string;
  /**
   * Jump the gallery to this image index — e.g. the photo the seller matched
   * to a colour the buyer just picked. Undefined leaves the gallery wherever
   * the shopper left it (a colour with no matched photo shouldn't yank them
   * back to image 1).
   */
  focusIndex?: number;
}) {
  const safeImages = images.length > 0 ? images : [PRODUCT_IMAGE_FALLBACK];
  const altFor = (i: number) => imageAlts?.[i]?.trim() || `${alt}, image ${i + 1}`;
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollTo = (idx: number) => {
    setActive(idx);
    const track = trackRef.current;
    if (track) track.scrollTo({ left: idx * track.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    if (focusIndex !== undefined && focusIndex >= 0 && focusIndex < safeImages.length) {
      scrollTo(focusIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIndex]);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const idx = Math.round(track.scrollLeft / track.clientWidth);
    if (idx !== active) setActive(idx);
  };

  return (
    <div className="space-y-2">
      <div className={cn("relative overflow-hidden rounded-card bg-fill", frameClassName)}>
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto"
        >
          {safeImages.map((src, i) => (
            <ProductImage
              key={src}
              src={src}
              alt={altFor(i)}
              className="h-full w-full shrink-0 snap-center object-cover"
            />
          ))}
        </div>
        {safeImages.length > 1 && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {safeImages.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to image ${i + 1}`}
                onClick={() => scrollTo(i)}
                className={cn(
                  "size-2 rounded-full transition-all",
                  i === active ? "w-5 bg-white" : "bg-white/60",
                )}
              />
            ))}
          </div>
        )}
      </div>

      {thumbnails && safeImages.length > 1 && (
        <div className={cn("no-scrollbar flex gap-2 overflow-x-auto", thumbnailsClassName)}>
          {safeImages.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`Show ${altFor(i)}`}
              onClick={() => scrollTo(i)}
              className={cn(
                "size-14 shrink-0 overflow-hidden rounded-xl ring-2 ring-offset-2 ring-offset-card transition-all",
                i === active ? "ring-primary" : "ring-transparent",
              )}
            >
              <ProductImage src={src} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
