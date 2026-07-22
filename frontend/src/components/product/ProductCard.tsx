import { Heart, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { Product } from "@/types";
import { cn } from "@/lib/utils";
import { discountedPrice, formatKes } from "@/lib/currency";
import { productImageSrc } from "@/lib/productImage";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Modal";
import { useAddToCart } from "@/hooks/useCart";
import { useFavoriteToggle } from "@/hooks/useFavorites";
import { useFavorites } from "@/stores/favorites";
import { useToasts } from "@/stores/toast";
import { ProductImage } from "./ProductImage";
import { SizeSelector } from "./SizeSelector";
import { StockBadge } from "./StockBadge";

export function ProductCard({ product, className }: { product: Product; className?: string }) {
  const isFavorite = useFavorites((s) => s.isFavorite(product.id));
  const toggle = useFavoriteToggle();
  const addToCart = useAddToCart();
  const push = useToasts((s) => s.push);

  const [sizeSheetOpen, setSizeSheetOpen] = useState(false);
  const [chosenSize, setChosenSize] = useState<string | null>(null);

  const soldOut = product.status === "out";
  const finalPrice = discountedPrice(product.priceKes, product.discountPct);
  const hasSizes = !!product.sizes && product.sizes.length > 0;

  const add = (size: string | null) => {
    if (!product.shopSlug) {
      push("Couldn't work out this product's shop — try again", "danger");
      return;
    }
    const added = addToCart({
      productId: product.id,
      shopSlug: product.shopSlug,
      name: product.name,
      image: productImageSrc(product.images),
      unitPrice: finalPrice,
      size,
      stockQty: product.stockQty,
    });
    if (!added) {
      push("Your cart has items from another shop — check out or clear it first", "danger");
      return;
    }
    push("Added to cart", "success");
  };

  const onAddClick = () => {
    if (hasSizes) {
      setChosenSize(null);
      setSizeSheetOpen(true);
    } else {
      add(null);
    }
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-card bg-card shadow-soft transition-shadow hover:shadow-md",
        className,
      )}
    >
      <Link
        to={`/product/${product.id}`}
        aria-disabled={soldOut}
        onClick={(e) => soldOut && e.preventDefault()}
        className={cn("block", soldOut && "cursor-default")}
      >
        <div className="relative aspect-[3/4] overflow-hidden bg-stone-100">
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
            <span className="text-sm font-extrabold text-ink">{formatKes(finalPrice)}</span>
            {product.discountPct != null && (
              <span className="text-xs font-medium text-muted line-through">
                {formatKes(product.priceKes)}
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
          aria-label={hasSizes ? `Choose size for ${product.name}` : `Add ${product.name} to cart`}
          onClick={onAddClick}
          className="absolute bottom-2.5 right-2.5 flex size-9 items-center justify-center rounded-full bg-primary text-white shadow-soft transition-transform active:scale-90 hover:bg-primary-deep"
        >
          <ShoppingBag className="size-[18px]" />
        </button>
      )}

      {hasSizes && (
        <Sheet open={sizeSheetOpen} onOpenChange={setSizeSheetOpen} title="Select a size">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ProductImage
                src={product.images[0]}
                alt={product.name}
                className="size-14 rounded-xl object-cover"
              />
              <div>
                <p className="text-sm font-bold text-ink">{product.name}</p>
                <p className="text-sm font-extrabold text-primary">{formatKes(finalPrice)}</p>
              </div>
            </div>
            <SizeSelector sizes={product.sizes ?? []} value={chosenSize} onChange={setChosenSize} />
            <Button
              size="lg"
              className="w-full"
              disabled={!chosenSize}
              onClick={() => {
                add(chosenSize);
                setSizeSheetOpen(false);
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
