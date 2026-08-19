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
  savingsFor,
  variantPrice,
} from "@/lib/currency";
import { showsSoldBadge, soldLabel } from "@/lib/socialProof";
import { productImageSrc } from "@/lib/productImage";
import { specSummary } from "@/lib/productSpecs";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Modal";
import { useAddToCart } from "@/hooks/useCart";
import { useFavoriteToggle } from "@/hooks/useFavorites";
import { useFavorites } from "@/stores/favorites";
import { useToasts } from "@/stores/toast";
import { ColorSelector } from "./ColorSelector";
import { ProductImage } from "./ProductImage";
import { RatingRow } from "./RatingRow";
import { SizeSelector } from "./SizeSelector";
import { StockBadge } from "./StockBadge";

/**
 * One product, as a grid tile or as a list row.
 *
 * Both layouts live here rather than in a separate ProductRow because
 * everything behind them is identical: the price/variant maths, the add-to-cart
 * guard, the "your cart is from another shop" case and the variant sheet. Only
 * the arrangement differs, so splitting them would mean maintaining that logic
 * twice and having it drift.
 */
export function ProductCard({
  product,
  className,
  layout = "grid",
}: {
  product: Product;
  className?: string;
  /** "row" is the storefront's list view: wider, and with room for the specs a
   * square tile has nowhere to put. */
  layout?: "grid" | "row";
}) {
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

  // --- pieces shared by both layouts ---------------------------------------

  /* Only once someone has actually reviewed it. An unreviewed product showing
     "0.0 (0)" reads as a bad product rather than a new one. */
  const ratingBlock = product.reviewCount > 0 && (
    <RatingRow rating={product.rating} reviewCount={product.reviewCount} compact />
  );

  /* Recent demand, Amazon's placement: under the stars, above the price, so it
     is read as a reason to keep going rather than as part of the price. Hidden
     below the threshold on purpose — see lib/socialProof.ts. */
  const soldBlock = showsSoldBadge(product.soldLast30d) && (
    <p className="text-[11px] font-medium text-muted">
      {soldLabel(product.soldLast30d)} bought in past month
    </p>
  );

  /**
   * What the discount is worth, in the corner of the photo where the "-25%"
   * pill used to sit.
   *
   * It replaces that pill rather than joining it. The two say the same thing,
   * and of the two it is the shillings a shopper actually compares offers with
   * — "-25%" of an unknown number is not yet information. Keeping both would
   * have spent the tile's most valuable spot saying one fact twice.
   *
   * Not shown when sold out: the photo already carries the Sold Out plate, and
   * a saving on something nobody can buy is noise.
   */
  const savings = savingsFor(product);
  const savingsBadge = savings > 0 && !soldOut && (
    <span className={cn(
      "absolute rounded-full bg-success-deep font-bold text-white",
      layout === "row" ? "left-1.5 top-1.5 px-1.5 py-0.5 text-[10px]" : "left-2.5 top-2.5 px-2 py-0.5 text-[11px]",
    )}>
      Save {formatKes(savings)}
    </span>
  );

  const priceBlock = (
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
  );

  const favoriteButton = (
    <button
      type="button"
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFavorite}
      onClick={() => toggle(product.id)}
      className="absolute right-2.5 top-2.5 flex size-9 items-center justify-center rounded-full bg-card/90 shadow-soft backdrop-blur transition-transform active:scale-90"
    >
      <Heart
        className={cn(
          "size-[18px] transition-colors",
          isFavorite ? "fill-favorite text-favorite" : "text-muted",
        )}
      />
    </button>
  );

  const addLabel = needsChoice
    ? `Choose options for ${product.name}`
    : `Add ${product.name} to cart`;

  const variantSheet = needsChoice && (
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
            <SizeSelector sizes={product.sizes ?? []} value={chosenSize} onChange={setChosenSize} />
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
  );

  // --- list row -------------------------------------------------------------

  if (layout === "row") {
    // The whole reason the list view exists: a square tile has nowhere to put
    // these, so two near-identical phone listings look identical on the grid.
    const specs = specSummary(product);

    return (
      <div
        className={cn(
          "group relative flex gap-3 overflow-hidden rounded-card bg-card p-3 shadow-soft transition-shadow hover:shadow-md",
          className,
        )}
      >
        <Link
          to={productHref(product)}
          aria-disabled={soldOut}
          onClick={(e) => soldOut && e.preventDefault()}
          className={cn("shrink-0", soldOut && "cursor-default")}
          tabIndex={-1}
          aria-hidden
        >
          <div className="relative size-28 overflow-hidden rounded-xl bg-fill sm:size-32">
            <ProductImage
              src={product.images[0]}
              alt=""
              loading="lazy"
              className={cn("size-full object-cover", soldOut && "opacity-40")}
            />
            {soldOut && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-ink/85 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-on-accent">
                  Sold Out
                </span>
              </div>
            )}
            {savingsBadge}
          </div>
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* pr-10 keeps the title clear of the favourite button pinned above it */}
          <Link
            to={productHref(product)}
            aria-disabled={soldOut}
            onClick={(e) => soldOut && e.preventDefault()}
            className={cn("min-w-0 pr-10", soldOut && "cursor-default")}
          >
            <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-ink">
              {product.name}
            </h3>
          </Link>
          {ratingBlock}
          {soldBlock}
          {specs.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {specs.map((s) => (
                <li
                  key={s}
                  className="rounded-full bg-fill px-2 py-0.5 text-[11px] font-medium text-muted"
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
          {priceBlock}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-0.5">
            {!soldOut ? <StockBadge status={product.status} /> : <span />}
            {!soldOut && (
              <Button size="sm" aria-label={addLabel} onClick={onAddClick}>
                <ShoppingBag className="size-4" />
                Add
              </Button>
            )}
          </div>
        </div>

        {favoriteButton}
        {variantSheet}
      </div>
    );
  }

  // --- grid tile ------------------------------------------------------------

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
        <div className="relative aspect-square overflow-hidden bg-fill">
          <ProductImage
            src={product.images[0]}
            // The seller's own description of the cover photo when they wrote
            // one (migration 0039); the product name otherwise.
            alt={product.imageAlts?.[0]?.trim() || product.name}
            loading="lazy"
            className={cn(
              "size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]",
              soldOut && "opacity-40",
            )}
          />
          {soldOut && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-ink/85 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-on-accent">
                Sold Out
              </span>
            </div>
          )}
          {savingsBadge}
        </div>
        {/* Title, rating, price, stock — in that order, which is the order the
            decision actually gets made in: what is it, do people rate it, what
            does it cost, can I have it. */}
        <div className="space-y-1.5 p-3">
          {/* Two lines, always reserved. A single truncated line puts the price
              of a product called "Belt" on a different baseline from one called
              "Samsung Galaxy A54 5G 128GB", so nothing lines up across a grid
              row; clamping to two and holding the height fixes the baseline and
              stops long names being cut at "Samsung Galaxy A54 5G…". */}
          <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-ink">
            {product.name}
          </h3>
          {ratingBlock}
          {soldBlock}
          {priceBlock}
          {!soldOut && <StockBadge status={product.status} />}
        </div>
      </Link>

      {favoriteButton}

      {!soldOut && (
        <button
          type="button"
          aria-label={addLabel}
          onClick={onAddClick}
          className="absolute bottom-2.5 right-2.5 flex size-9 items-center justify-center rounded-full bg-primary text-on-accent shadow-soft transition-transform active:scale-90 hover:bg-primary-deep"
        >
          <ShoppingBag className="size-[18px]" />
        </button>
      )}

      {variantSheet}
    </div>
  );
}
