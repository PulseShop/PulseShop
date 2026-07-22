import { Heart, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { Product } from "@/types";
import { cn } from "@/lib/utils";
import { productHref } from "@/lib/productUrl";
import {
  formatKes,
  hasPriceRange,
  minVariantPrice,
  priceForSelection,
  variantPrice,
} from "@/lib/currency";
import { productImageSrc } from "@/lib/productImage";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Modal";
import { useAddToCart } from "@/hooks/useCart";
import { useFavoriteToggle } from "@/hooks/useFavorites";
import { useFavorites } from "@/stores/favorites";
import { useToasts } from "@/stores/toast";
import { ColorSelector } from "./ColorSelector";
import { ProductImage } from "./ProductImage";
import { SizeSelector } from "./SizeSelector";
import { StockBadge } from "./StockBadge";

export function ProductCard({ product, className }: { product: Product; className?: string }) {
  const isFavorite = useFavorites((s) => s.isFavorite(product.id));
  const toggle = useFavoriteToggle();
  const addToCart = useAddToCart();
  const push = useToasts((s) => s.push);

  const [variantSheetOpen, setVariantSheetOpen] = useState(false);
  const [chosenSize, setChosenSize] = useState<string | null>(null);
  const [chosenColor, setChosenColor] = useState<string | null>(null);

  const soldOut = product.status === "out";
  // With variants a product has a range, not a price. The card shows the
  // cheapest reachable one and says so — the same number the grid sorts by and
  // the price filter compares against, server-side.
  const fromPrice = minVariantPrice(product);
  const ranged = hasPriceRange(product);
  // Inside the sheet the figure tracks what they've picked so far.
  const sheetPrice = priceForSelection(product, chosenSize, chosenColor);
  const hasSizes = !!product.sizes && product.sizes.length > 0;
  const hasColors = !!product.colors && product.colors.length > 0;
  /** A one-tap add is only honest when there's nothing left to choose. */
  const needsChoice = hasSizes || hasColors;

  const add = (size: string | null, color: string | null) => {
    if (!product.shopSlug) {
      push("Couldn't work out this product's shop — try again", "danger");
      return;
    }
    const added = addToCart({
      productId: product.id,
      shopSlug: product.shopSlug,
      name: product.name,
      image: productImageSrc(product.images),
      unitPrice: variantPrice(product, size, color),
      size,
      color,
      stockQty: product.stockQty,
    });
    if (!added) {
      push("Your cart has items from another shop — check out or clear it first", "danger");
      return;
    }
    push("Added to cart", "success");
  };

  const onAddClick = () => {
    if (needsChoice) {
      setChosenSize(null);
      setChosenColor(null);
      setVariantSheetOpen(true);
    } else {
      add(null, null);
    }
  };

  // Every choice the seller offers has to be made — a size-only product needs a
  // size, a size-and-colour product needs both.
  const choiceComplete = (!hasSizes || chosenSize) && (!hasColors || chosenColor);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-card bg-card shadow-soft transition-shadow hover:shadow-md",
        className,
      )}
    >
      <Link
        to={productHref(product)}
        aria-disabled={soldOut}
        onClick={(e) => soldOut && e.preventDefault()}
        className={cn("block", soldOut && "cursor-default")}
      >
        {/* square, matching the square crop applied at upload — the frame and
            the stored image agree, so nothing gets cut off */}
        <div className="relative aspect-square overflow-hidden bg-stone-100">
          <ProductImage
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            className={cn(
              "size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]",
              soldOut && "opacity-40",
            )}
          />
          {soldOut && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-ink/85 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
                Sold Out
              </span>
            </div>
          )}
          {product.discountPct != null && !soldOut && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-favorite px-2 py-0.5 text-[11px] font-bold text-white">
              -{product.discountPct}%
            </span>
          )}
        </div>
        <div className="space-y-1.5 p-3">
          <h3 className="truncate text-sm font-semibold text-ink">{product.name}</h3>
          <div className="flex items-baseline gap-1.5">
            {ranged && <span className="text-xs font-medium text-muted">from</span>}
            <span className="text-sm font-extrabold text-ink">{formatKes(fromPrice)}</span>
            {product.discountPct != null && (
              // The "was" figure has to be the pre-discount price of the SAME
              // variant we're quoting, or a -50% XL shows the base product's
              // old price struck through and the discount looks wrong.
              <span className="text-xs font-medium text-muted line-through">
                {formatKes(minVariantPrice({ ...product, discountPct: null }))}
              </span>
            )}
          </div>
          {!soldOut && <StockBadge status={product.status} />}
        </div>
      </Link>

      <button
        type="button"
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={isFavorite}
        onClick={() => toggle(product.id)}
        className="absolute right-2.5 top-2.5 flex size-9 items-center justify-center rounded-full bg-white/90 shadow-soft backdrop-blur transition-transform active:scale-90"
      >
        <Heart
          className={cn(
            "size-[18px] transition-colors",
            isFavorite ? "fill-favorite text-favorite" : "text-stone-500",
          )}
        />
      </button>

      {!soldOut && (
        <button
          type="button"
            aria-label={
            needsChoice ? `Choose options for ${product.name}` : `Add ${product.name} to cart`
          }
          onClick={onAddClick}
          className="absolute bottom-2.5 right-2.5 flex size-9 items-center justify-center rounded-full bg-primary text-white shadow-soft transition-transform active:scale-90 hover:bg-primary-deep"
        >
          <ShoppingBag className="size-[18px]" />
        </button>
      )}

      {needsChoice && (
        <Sheet
          open={variantSheetOpen}
          onOpenChange={setVariantSheetOpen}
          title={hasSizes && hasColors ? "Choose size and colour" : hasSizes ? "Select a size" : "Select a colour"}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ProductImage
                src={product.images[0]}
                alt={product.name}
                className="size-14 rounded-xl object-cover"
              />
              <div>
                <p className="text-sm font-bold text-ink">{product.name}</p>
                <p className="text-sm font-extrabold text-primary">
                  {!choiceComplete && ranged && (
                    <span className="text-xs font-medium text-muted">from </span>
                  )}
                  {formatKes(sheetPrice)}
                </p>
              </div>
            </div>
            {hasSizes && (
              <div className="space-y-2">
                <p className="text-sm font-bold text-ink">Size</p>
                <SizeSelector
                  sizes={product.sizes ?? []}
                  value={chosenSize}
                  onChange={setChosenSize}
                />
              </div>
            )}
            {hasColors && (
              <div className="space-y-2">
                <p className="text-sm font-bold text-ink">Colour</p>
                <ColorSelector
                  colors={product.colors ?? []}
                  value={chosenColor}
                  onChange={setChosenColor}
                />
              </div>
            )}
            <Button
              size="lg"
              className="w-full"
              disabled={!choiceComplete}
              onClick={() => {
                add(chosenSize, chosenColor);
                setVariantSheetOpen(false);
              }}
            >
              <ShoppingBag className="size-5" />
              Add to Cart
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
