import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Heart, Search, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { MobileShell } from "@/components/layout/MobileShell";
import { Gallery } from "@/components/product/Gallery";
import { ProductCard } from "@/components/product/ProductCard";
import { RatingRow } from "@/components/product/RatingRow";
import { ShareMenu } from "@/components/product/ShareMenu";
import { SizeSelector } from "@/components/product/SizeSelector";
import { StockBadge, stockDetailLabel } from "@/components/product/StockBadge";
import { Button } from "@/components/ui/Button";
import { SocialLinks } from "@/components/shop/SocialLinks";
import { Skeleton } from "@/components/ui/Skeleton";
import { discountedPrice, formatKes } from "@/lib/currency";
import { productInquiryLinks } from "@/lib/deeplinks";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { useFavoriteToggle } from "@/hooks/useFavorites";
import { useAuth } from "@/stores/auth";
import { useCart } from "@/stores/cart";
import { useFavorites } from "@/stores/favorites";
import { useOrderStore } from "@/stores/order";
import { useShop, useShopHome } from "@/stores/shop";
import { useToasts } from "@/stores/toast";

export function ProductDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const push = useToasts((s) => s.push);
  const home = useShopHome();
  const setShopSlug = useShop((s) => s.setSlug);
  const session = useAuth((s) => s.session);
  const qc = useQueryClient();

  const productQ = useQuery({
    queryKey: ["product", id],
    queryFn: () => services.products.getProduct(id),
  });
  const product = productQ.data;

  // The product carries its owning shop's handle — use it to load the right
  // merchant (for contact/order routing) and remember it as the active shop.
  const shopSlug = product?.shopSlug ?? null;
  useEffect(() => {
    if (shopSlug) setShopSlug(shopSlug);
  }, [shopSlug, setShopSlug]);

  const merchantQ = useQuery({
    queryKey: ["shop", shopSlug],
    queryFn: () => services.products.getShop(shopSlug!),
    enabled: Boolean(shopSlug),
  });

  const isFavorite = useFavorites((s) => s.isFavorite(id));
  const toggle = useFavoriteToggle();
  const addToCart = useCart((s) => s.add);
  const { selectedSize, setSelectedSize } = useOrderStore();
  const [localSize, setLocalSize] = useState<string | null>(null);

  const merchant = merchantQ.data;
  // A merchant can't rate their own product — the DB rejects it too.
  const ownsProduct = Boolean(session && merchant && session.id === merchant.id);

  // Related products: same shop, same category first, other categories fill
  // any remaining slots — sellers pick their own free-text categories, so
  // there's no fixed taxonomy to map "Gaming Consoles" to "Electronics" against.
  const shopProductsQ = useQuery({
    queryKey: ["shop-products", shopSlug],
    queryFn: () => services.products.listShopProducts(merchant!.id),
    enabled: Boolean(merchant),
  });
  const relatedProducts = useMemo(() => {
    if (!product) return [];
    const others = (shopProductsQ.data ?? []).filter((p) => p.id !== product.id);
    const sameCategory = others.filter((p) => p.category === product.category);
    const rest = others.filter((p) => p.category !== product.category);
    return [...sameCategory, ...rest].slice(0, 6);
  }, [shopProductsQ.data, product]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const submitSearch = () => {
    if (!searchQuery.trim()) return;
    navigate(`${home}?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const myRatingQ = useQuery({
    queryKey: ["my-rating", id],
    queryFn: () => services.reviews.getMyRating(id),
    enabled: Boolean(session) && !ownsProduct,
  });

  const rateMut = useMutation({
    mutationFn: (stars: number) => services.reviews.rateProduct(id, stars),
    onSuccess: (_data, stars) => {
      // The product's average is recomputed server-side — refetch, don't guess.
      qc.invalidateQueries({ queryKey: ["product", id] });
      qc.setQueryData(["my-rating", id], stars);
      push(`You rated this ${stars} ${stars === 1 ? "star" : "stars"}`, "success");
    },
    onError: () => push("Couldn't save your rating — try again", "danger"),
  });

  const rate = (stars: number) => {
    if (!session) {
      push("Sign in to rate this product");
      navigate("/login");
      return;
    }
    rateMut.mutate(stars);
  };

  if (productQ.isLoading) {
    return (
      <MobileShell homeTo={home}>
        <div className="space-y-4 p-4">
          <Skeleton className="h-[32dvh] min-h-40 max-h-80 w-full" />
          <Skeleton className="h-6 w-2/3 rounded" />
          <Skeleton className="h-5 w-1/3 rounded" />
          <Skeleton className="h-24 w-full" />
        </div>
      </MobileShell>
    );
  }

  if (!product) {
    return (
      <MobileShell homeTo={home}>
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-lg font-bold text-ink">Product not found</p>
          <Link to={home} className="font-semibold text-primary">
            Back to store
          </Link>
        </div>
      </MobileShell>
    );
  }

  const size = localSize ?? (product.sizes?.includes(selectedSize ?? "") ? selectedSize : null);
  const finalPrice = discountedPrice(product.priceKes, product.discountPct);
  const soldOut = product.status === "out";
  const links = merchant ? productInquiryLinks(merchant, product) : null;

  const orderNow = () => {
    if (product.sizes && !size) {
      push("Please select a size first");
      return;
    }
    setSelectedSize(size);
    navigate(`/order/${product.id}`);
  };

  const handleAddToCart = () => {
    if (product.sizes && !size) {
      push("Please select a size first");
      return;
    }
    if (!product.shopSlug) {
      push("Couldn't work out this product's shop — try again", "danger");
      return;
    }
    const added = addToCart({
      productId: product.id,
      shopSlug: product.shopSlug,
      name: product.name,
      image: product.images[0],
      unitPrice: finalPrice,
      size,
      stockQty: product.stockQty,
    });
    if (!added) {
      push("Your cart has items from another shop — check out or clear it first", "danger");
      return;
    }
    push("Added to cart — keep shopping", "success");
  };

  return (
    <MobileShell nav={false}>
      {/* header */}
      <header className="glass-header sticky top-0 z-30 flex items-center justify-between px-3 py-3">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate(-1)}
          className="flex size-10 items-center justify-center rounded-full bg-card shadow-soft"
        >
          <ArrowLeft className="size-5" />
        </button>
        <span className="max-w-[55%] truncate text-sm font-bold text-ink">{product.name}</span>
        <button
          type="button"
          aria-label="Search products"
          onClick={() => setSearchOpen((v) => !v)}
          className={cn(
            "flex size-10 items-center justify-center rounded-full shadow-soft transition-colors",
            searchOpen ? "bg-primary text-white" : "bg-card text-ink",
          )}
        >
          <Search className="size-5" />
        </button>
      </header>

      {searchOpen && (
        <div className="px-4 pt-3 animate-grid-fade">
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitSearch()}
            placeholder="Search products…"
            className="h-11 w-full rounded-btn border border-stone-200 bg-card px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}

      <div className="space-y-3.5 px-4 pb-24 pt-2">
        {/* Capped against the viewport so the price, rating and CTA stay above
            the fold on a phone instead of the square image pushing them off.
            Thumbnails are off here — swipe + dots cover it, and the strip alone
            was enough to push the page into scrolling. */}
        <Gallery
          images={product.images}
          alt={product.name}
          frameClassName="h-[32dvh] min-h-40 max-h-80"
          thumbnails={false}
        />

        {/* info block */}
        <div className="space-y-2">
          <nav className="flex items-center gap-1 text-xs font-medium text-muted">
            <Link to={home} className="hover:text-primary">
              Store
            </Link>
            <ChevronRight className="size-3.5" />
            <span>{product.category}</span>
          </nav>

          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-extrabold text-ink">{product.name}</h1>
            <div className="text-right">
              <p className="text-xl font-extrabold text-primary">{formatKes(finalPrice)}</p>
              {product.discountPct != null && (
                <p className="text-sm text-muted line-through">{formatKes(product.priceKes)}</p>
              )}
            </div>
          </div>

          <RatingRow
            rating={product.rating}
            reviewCount={product.reviewCount}
            myRating={myRatingQ.data ?? null}
            onRate={ownsProduct ? undefined : rate}
            pending={rateMut.isPending}
          />
          <StockBadge
            status={product.status}
            label={stockDetailLabel(product.status, product.stockQty)}
          />
          <p className="line-clamp-3 text-sm leading-relaxed text-ink/80">{product.description}</p>
        </div>

        {/* size selector */}
        {product.sizes && (
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-ink">Select Size</h2>
            <SizeSelector sizes={product.sizes} value={size} onChange={setLocalSize} />
          </div>
        )}

        {/* contact icons row — only channels the seller actually set up */}
        {links && links.length > 0 && (
          <div className="space-y-1.5 text-center">
            <div className="flex justify-center gap-4">
              <SocialLinks links={links} ariaPrefix="Ask on" />
            </div>
            <p className="text-xs font-medium text-muted">Ask about this product</p>
          </div>
        )}

        {/* related products — same shop, same category first */}
        {relatedProducts.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-ink">You might also like</h2>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} className="w-40 shrink-0" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* primary CTA — floating glass bar echoing the nav pill */}
      <div className="glass fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-[398px] -translate-x-1/2 items-center gap-1.5 rounded-full p-1.5">
        <button
          type="button"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          onClick={() => toggle(product.id)}
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/70 text-ink"
        >
          <Heart className={cn("size-4.5", isFavorite ? "fill-favorite text-favorite" : "text-ink")} />
        </button>
        <ShareMenu
          product={product}
          triggerClassName="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/70 text-ink"
        />
        <Button
          variant="outline"
          size="md"
          className="flex-1 whitespace-nowrap rounded-full border-white/60 bg-white/70 px-2"
          disabled={soldOut}
          onClick={handleAddToCart}
        >
          <ShoppingBag className="size-4.5" />
          Add
        </Button>
        <Button size="md" className="flex-1 whitespace-nowrap rounded-full px-2" disabled={soldOut} onClick={orderNow}>
          {soldOut ? "Sold Out" : "Buy Now"}
        </Button>
      </div>
    </MobileShell>
  );
}
