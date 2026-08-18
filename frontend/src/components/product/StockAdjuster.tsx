import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { services } from "@/services";
import { cn } from "@/lib/utils";
import type { Product } from "@/types";

interface StockAdjusterProps {
  product: Product;
}

export function StockAdjuster({ product }: StockAdjusterProps) {
  const qc = useQueryClient();
  const focused = useRef(false);
  const [value, setValue] = useState(String(product.stockQty));

  // Keep the field in sync with server state (e.g. after a +/- click), but
  // never clobber what the seller is actively typing.
  useEffect(() => {
    if (!focused.current) setValue(String(product.stockQty));
  }, [product.stockQty]);

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

  const commitTyped = () => {
    const n = Math.floor(Number(value));
    if (value.trim() === "" || !Number.isFinite(n) || n < 0) {
      setValue(String(product.stockQty));
      return;
    }
    if (n !== product.stockQty) updateStockMut.mutate(n);
    else setValue(String(n));
  };

  const stepBtnClass =
    "flex size-7 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40";

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
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        disabled={updateStockMut.isPending}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          focused.current = false;
          commitTyped();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValue(String(product.stockQty));
            e.currentTarget.blur();
          }
        }}
        aria-label="Stock quantity"
        className="w-14 rounded-md border border-transparent bg-transparent text-center text-sm font-semibold text-ink outline-none transition-colors focus:border-primary focus:bg-card [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
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
