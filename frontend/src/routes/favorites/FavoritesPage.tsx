import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { MobileShell } from "@/components/layout/MobileShell";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductCardSkeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { Product } from "@/types";
import { useFavorites } from "@/stores/favorites";
import { useShopHome } from "@/stores/shop";

export function FavoritesPage() {
  const favorites = useFavorites((s) => s.favorites);
  const home = useShopHome();
  const favIds = favorites.map((f) => f.productId);

  // Fetch each favorited product by id so favorites work across shops and for
  // shoppers who aren't the merchant.
  const productsQ = useQuery({
    queryKey: ["fav-products", favIds],
    queryFn: async () => {
      const results = await Promise.all(favIds.map((id) => services.products.getProduct(id)));
      return results.filter((p): p is Product => p !== null);
    },
    enabled: favIds.length > 0,
  });
  // ids currently animating out (200ms exit before the store removes them)
  const [exiting, setExiting] = useState<string[]>([]);

  const favSet = new Set(favorites.map((f) => f.productId));
  const items = (productsQ.data ?? []).filter(
    (p) => favSet.has(p.id) || exiting.includes(p.id),
  );

  return (
    <MobileShell homeTo={home}>
      <header className="px-4 pt-5">
        <h1 className="text-xl font-extrabold text-ink">Favorites</h1>
        <p className="text-sm text-muted">
          {favorites.length} saved {favorites.length === 1 ? "item" : "items"}
        </p>
      </header>

      <section className="px-4 py-4">
        {productsQ.isLoading && favorites.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: Math.min(favorites.length, 4) }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-card shadow-soft">
              <Heart className="size-9 text-stone-300" />
            </div>
            <div>
              <p className="text-lg font-bold text-ink">No favorites yet</p>
              <p className="mt-1 text-sm text-muted">
                Tap the heart on any product to save it here.
              </p>
            </div>
            <Link
              to={home}
              className="rounded-btn bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-soft"
            >
              Browse products
            </Link>
          </div>
        ) : (
          <FavGrid
            items={items}
            exiting={exiting}
            onExit={(id) => {
              setExiting((e) => [...e, id]);
              setTimeout(() => setExiting((e) => e.filter((x) => x !== id)), 220);
            }}
          />
        )}
      </section>
    </MobileShell>
  );
}

function FavGrid({
  items,
  exiting,
  onExit,
}: {
  items: import("@/types").Product[];
  exiting: string[];
  onExit: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((p) => (
        <div
          key={p.id}
          className={cn(exiting.includes(p.id) && "animate-card-exit pointer-events-none")}
          onClickCapture={(e) => {
            // intercept the heart tap so we can play the exit animation first
            const target = e.target as HTMLElement;
            if (target.closest("button[aria-pressed='true']")) onExit(p.id);
          }}
        >
          <ProductCard product={p} />
        </div>
      ))}
    </div>
  );
}
