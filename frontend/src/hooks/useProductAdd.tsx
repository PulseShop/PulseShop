import { ShoppingBag } from "lucide-react";
import { useState } from "react";

import { ColorSelector } from "@/components/product/ColorSelector";
import { ProductImage } from "@/components/product/ProductImage";
import { SizeSelector } from "@/components/product/SizeSelector";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Modal";
import { useAddToCart } from "@/hooks/useCart";
import { formatKes, hasPriceRange, priceForSelection, variantPrice } from "@/lib/currency";
import { productImageSrc } from "@/lib/productImage";
import { useToasts } from "@/stores/toast";
import type { Product } from "@/types";

/**
 * Putting a product in the cart from anywhere that is not the product page.
 *
 * IT LIVED INSIDE ProductCard until the marketplace banners grew their own add
 * buttons. Everything here is the part a shopper never sees as belonging to a
 * particular card — the "your cart is from another shop" guard, the toast, and
 * the sheet that appears when a product has sizes or colours and a one-tap add
 * would therefore be a lie about what was added. Copying that into the promoted
 * and sponsored cards would have been three places for the same rules to drift
 * apart in, and the variant sheet is the half nobody remembers to copy.
 *
 * The caller draws its own button and renders `variantSheet` somewhere inside
 * itself; everything else is decided here.
 */
export function useProductAdd(product: Product) {
  const addToCart = useAddToCart();
  const push = useToasts((s) => s.push);

  const [variantSheetOpen, setVariantSheetOpen] = useState(false);
  const [chosenSize, setChosenSize] = useState<string | null>(null);
  const [chosenColor, setChosenColor] = useState<string | null>(null);

  const ranged = hasPriceRange(product);
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

  const addLabel = needsChoice
    ? `Choose options for ${product.name}`
    : `Add ${product.name} to cart`;

  const variantSheet = needsChoice && (
    <Sheet
      open={variantSheetOpen}
      onOpenChange={setVariantSheetOpen}
      title={
        hasSizes && hasColors
          ? "Choose size and colour"
          : hasSizes
            ? "Select a size"
            : "Select a colour"
      }
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

  return {
    needsChoice,
    addLabel,
    onAddClick,
    variantSheet,
    /**
     * Whether the variant sheet is open right now.
     *
     * For callers that are themselves moving — the marketplace hero rotates
     * every twelve seconds and unmounts the slide it is on, which would take
     * the half-answered size sheet with it. It reads this and stops the clock
     * while a choice is being made.
     */
    sheetOpen: variantSheetOpen,
  };
}
