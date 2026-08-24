import { useQueries } from "@tanstack/react-query";
import { ArrowRight, Minus, Plus, ShoppingBag, Store, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { type AppliedDiscount, DiscountCodeSection } from "@/components/cart/DiscountCodeSection";
import { MobileShell } from "@/components/layout/MobileShell";
import { DesktopQuickNav } from "@/components/layout/DesktopQuickNav";
import { DesktopBack } from "@/components/layout/DesktopBack";
import { ProductImage } from "@/components/product/ProductImage";
import { RecommendedProducts } from "@/components/product/RecommendedProducts";
import { Button } from "@/components/ui/Button";
import { formatKes } from "@/lib/currency";
import { variantKey, variantLabel } from "@/lib/variant";
import { useRemoveFromCart, useSetCartQty } from "@/hooks/useCart";
import { services } from "@/services";
import { cartShopCount, cartSubtotal, groupByShop, useCart } from "@/stores/cart";
import { useShopHome } from "@/stores/shop";

export function CartPage() {
  const navigate = useNavigate();
  const home = useShopHome();
  const items = useCart((s) => s.items);
  const storedCode = useCart((s) => s.discountCode);
  const setStoredCode = useCart((s) => s.setDiscountCode);
  const setQty = useSetCartQty();
  const remove = useRemoveFromCart();
  const subtotal = cartSubtotal(items);

  // The cart can now span sellers (migration 0062), so it renders as one
  // section per shop. Names come from one query per distinct slug, sharing the
  // ["shop", slug] key every other page already uses — so a shop the buyer just
  // came from is already in cache and never refetched.
  const groups = groupByShop(items);
  const shopQueries = useQueries({
    queries: groups.map((g) => ({
      queryKey: ["shop", g.shopSlug],
      queryFn: () => services.products.getShop(g.shopSlug),
    })),
  });
  const shopCount = cartShopCount(items);

  // A discount code belongs to ONE shop and is previewed against that shop's
  // id, so the input only appears when the cart holds a single seller. The
  // server still resolves a code against whichever shop in the cart owns it
  // (place_cart_order), but showing a preview here for a mixed cart would mean
  // guessing which seller it applies to, and a wrong preview at checkout is
  // worse than no input.
  const singleShop = shopCount === 1 ? shopQueries[0]?.data : undefined;

  const [applied, setApplied] = useState<AppliedDiscount | null>(null);
  const discountKes = applied?.preview.valid ? applied.preview.discountKes : 0;
  const displayTotal = Math.max(0, subtotal - discountKes);

  if (items.length === 0) {
    return (
      <MobileShell homeTo={home} wide>
        <header className="glass-header sticky top-0 z-30 flex items-center justify-between px-4 py-4 lg:px-6">
          <div className="flex items-center gap-2">
            <DesktopBack homeTo={home} className="-ml-2" />
            <h1 className="text-lg font-extrabold text-ink lg:text-2xl">Your Cart</h1>
          </div>
          <DesktopQuickNav />
        </header>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-fill">
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
          {/* The cart is a dead end past lg without this — the floating back
              button is phone-only and nothing else here goes backwards. */}
          <DesktopBack homeTo={home} className="-ml-2" />
          <h1 className="text-lg font-extrabold text-ink lg:text-2xl">Your Cart</h1>
          <span className="text-sm font-semibold text-muted">
            {items.length} {items.length === 1 ? "item" : "items"}
            {shopCount > 1 && ` from ${shopCount} shops`}
          </span>
        </div>
        <DesktopQuickNav />
      </header>

      <div className="px-4 pb-6 pt-1 lg:flex lg:items-start lg:gap-8 lg:px-6 lg:pt-4">
        <div className="space-y-4 lg:flex-1">
          {groups.map((group, gi) => (
            <section key={group.shopSlug} className="space-y-3">
              {/* One header per seller. Shown even for a single-shop cart:
                  the buyer is about to place an order that names this shop,
                  and "sold by" is the fact that makes the grouping legible
                  the first time a second shop appears. */}
              <div className="flex items-center justify-between gap-3 px-1">
                <Link
                  to={`/shop/${group.shopSlug}`}
                  className="flex min-w-0 items-center gap-2 text-sm font-bold text-ink transition-colors hover:text-primary"
                >
                  <Store className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">
                    {shopQueries[gi]?.data?.name ?? `@${group.shopSlug}`}
                  </span>
                </Link>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
                  {formatKes(group.subtotal)}
                </span>
              </div>

              {group.items.map((item) => (
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
                      className="flex size-7 items-center justify-center rounded-full bg-fill disabled:opacity-40"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold">{item.qty}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setQty(item.productId, item.size, item.color, item.qty + 1)}
                      disabled={item.qty >= item.stockQty}
                      className="flex size-7 items-center justify-center rounded-full bg-fill disabled:opacity-40"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
              ))}
            </section>
          ))}
        </div>

        {/* summary — sticky sidebar on desktop, inline card on mobile */}
        <div className="mt-3 space-y-3 rounded-card bg-card p-4 shadow-soft lg:sticky lg:top-24 lg:mt-0 lg:w-80 lg:shrink-0">
          {singleShop && (
            <DiscountCodeSection
              merchantId={singleShop.id}
              items={items.map((i) => ({ productId: i.productId, qty: i.qty }))}
              applied={applied}
              onApply={(a) => {
                setApplied(a);
                setStoredCode(a.code);
              }}
              onClear={() => {
                setApplied(null);
                setStoredCode(null);
              }}
              initialCode={storedCode}
            />
          )}
          <div className="flex items-center justify-between border-t border-line-soft pt-3 text-sm">
            <span className="font-semibold text-muted">Subtotal</span>
            <span className="font-bold text-ink">{formatKes(subtotal)}</span>
          </div>
          {discountKes > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-muted">Discount ({applied?.code})</span>
              <span className="font-semibold text-success">−{formatKes(discountKes)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-line-soft pt-3">
            <span className="text-base font-bold text-ink">Total</span>
            <span className="text-lg font-extrabold text-primary">{formatKes(displayTotal)}</span>
          </div>
          <p className="text-xs text-muted">
            {shopCount > 1
              ? `Your ${shopCount} shops send their items to the PulseShop warehouse. You pick a collection station at checkout.`
              : "Your order goes to the PulseShop warehouse. You pick a collection station at checkout."}
          </p>
          <Button size="lg" className="w-full" onClick={() => navigate("/checkout")}>
            Proceed to Checkout <ArrowRight className="size-5" />
          </Button>
        </div>
      </div>
    </MobileShell>
  );
}
