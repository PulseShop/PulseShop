import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { services } from "@/services";
import { cn } from "@/lib/utils";
import type { Product } from "@/types";

interface StockAdjusterProps {
  product: Product;
}

export function StockAdjuster({ product }: StockAdjusterProps) {
  const qc = useQueryClient();

  const updateStockMut = useMutation({
    mutationFn: (newStock: number) =>
      services.products.updateProduct(product.id, { stockQty: newStock }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const adjust = (amount: number) => {
    const newStock = Math.max(0, product.stockQty + amount);
    updateStockMut.mutate(newStock);
  };

  const stepBtnClass =
    "flex size-7 shrink-0 items-center justify-center rounded-lg border border-stone-200 text-muted transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={cn(stepBtnClass)}
        onClick={() => adjust(-1)}
        disabled={product.stockQty === 0 || updateStockMut.isPending}
        aria-label="Decrease stock by one"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="w-8 text-center text-sm font-semibold text-ink">
        {product.stockQty}
      </span>
      <button
        type="button"
        className={cn(stepBtnClass)}
        onClick={() => adjust(1)}
        disabled={updateStockMut.isPending}
        aria-label="Increase stock by one"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
