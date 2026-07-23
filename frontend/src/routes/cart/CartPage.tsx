import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { MobileShell } from "@/components/layout/MobileShell";
import { DesktopQuickNav } from "@/components/layout/DesktopQuickNav";
import { ProductImage } from "@/components/product/ProductImage";
import { RecommendedProducts } from "@/components/product/RecommendedProducts";
import { Button } from "@/components/ui/Button";
import { formatKes } from "@/lib/currency";
import { variantKey, variantLabel } from "@/lib/variant";
import { useRemoveFromCart, useSetCartQty } from "@/hooks/useCart";
import { cartSubtotal, useCart } from "@/stores/cart";
import { useShopHome } from "@/stores/shop";

export function CartPage() {
  const navigate = useNavigate();
  const home = useShopHome();
  const items = useCart((s) => s.items);
  const setQty = useSetCartQty();
  const remove = useRemoveFromCart();
  const subtotal = cartSubtotal(items);

  if (items.length === 0) {
    return (
      <MobileShell homeTo={home} wide>
        <header className="glass-header sticky top-0 z-30 flex items-center justify-between px-4 py-4 lg:px-6">
          <h1 className="text-lg font-extrabold text-ink lg:text-2xl">Your Cart</h1>
          <DesktopQuickNav />
        </header>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-stone-100">
            <ShoppingBag className="size-7 text-muted" />
          </div>
          <p className="text-lg font-bold text-ink">Your cart is empty</p>
          <p className="text-sm text-muted">Add items while you browse, then check out all at once.</p>
          <Link to={home} className="mt-1 font-semibold text-primary">
            Browse products
          </Link>
        </div>

        {/* An empty cart is a chance to sell — surface the newest products across
            the platform so the shopper has somewhere to go. */}
        <div className="px-4 pb-10 lg:px-6">
          <RecommendedProducts title="Fresh from our newest shops" limit={6} />
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell homeTo={home} wide>
      <header className="glass-header sticky top-0 z-30 flex items-center justify-between px-4 py-4 lg:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-extrabold text-ink lg:text-2xl">Your Cart</h1>
          <span className="text-sm font-semibold text-muted">
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
        </div>
        <DesktopQuickNav />
      </header>

      <div className="px-4 pb-6 pt-1 lg:flex lg:items-start lg:gap-8 lg:px-6 lg:pt-4">
        <div className="space-y-3 lg:flex-1">
          {items.map((item) => (
            <div
              key={`${item.productId}-${variantKey(item.size, item.color)}`}
              className="flex gap-3 rounded-card bg-card p-3 shadow-soft"
            >
              <ProductImage src={item.image} alt={item.name} className="size-20 rounded-xl object-cover" />
              <div className="flex flex-1 flex-col justify-between py-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-ink">{item.name}</p>
                    {variantLabel(item.size, item.color) && (
                      <p className="text-xs text-muted">{variantLabel(item.size, item.color)}</p>
                    )}
                    <p className="text-xs font-semibold text-primary">{formatKes(item.unitPrice)} each</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => remove(item.productId, item.size, item.color)}
                    className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-ink">
                    {formatKes(item.unitPrice * item.qty)}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => setQty(item.productId, item.size, item.color, item.qty - 1)}
                      disabled={item.qty <= 1}
                      className="flex size-7 items-center justify-center rounded-full bg-stone-100 disabled:opacity-40"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold">{item.qty}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setQty(item.productId, item.size, item.color, item.qty + 1)}
                      disabled={item.qty >= item.stockQty}
                      className="flex size-7 items-center justify-center rounded-full bg-stone-100 disabled:opacity-40"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* summary — sticky sidebar on desktop, inline card on mobile */}
        <div className="mt-3 space-y-3 rounded-card bg-card p-4 shadow-soft lg:sticky lg:top-24 lg:mt-0 lg:w-80 lg:shrink-0">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-muted">Subtotal</span>
            <span className="font-bold text-ink">{formatKes(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-stone-100 pt-3">
            <span className="text-base font-bold text-ink">Total</span>
            <span className="text-lg font-extrabold text-primary">{formatKes(subtotal)}</span>
          </div>
          <p className="text-xs text-muted">
            Delivery is arranged with the seller after you place the order.
          </p>
          <Button size="lg" className="w-full" onClick={() => navigate("/checkout")}>
            Proceed to Checkout <ArrowRight className="size-5" />
          </Button>
        </div>
      </div>
    </MobileShell>
  );
}
