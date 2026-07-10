import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronRight, Heart, Share2, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { MobileShell } from "@/components/layout/MobileShell";
import { Gallery } from "@/components/product/Gallery";
import { RatingRow } from "@/components/product/RatingRow";
import { SizeSelector } from "@/components/product/SizeSelector";
import { StockBadge, stockDetailLabel } from "@/components/product/StockBadge";
import { Button } from "@/components/ui/Button";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
import { Skeleton } from "@/components/ui/Skeleton";
import { discountedPrice, formatKes } from "@/lib/currency";
import { productInquiryLinks } from "@/lib/deeplinks";
import { cn } from "@/lib/utils";
import { services } from "@/services";
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
  const toggle = useFavorites((s) => s.toggle);
  const addToCart = useCart((s) => s.add);
  const { selectedSize, setSelectedSize } = useOrderStore();
  const [localSize, setLocalSize] = useState<string | null>(null);

  const merchant = merchantQ.data;

  if (productQ.isLoading) {
    return (
      <MobileShell homeTo={home}>
        <div className="space-y-4 p-4">
          <Skeleton className="aspect-square w-full" />
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

  const share = async () => {
    const data = { title: product.name, text: product.name, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(window.location.href);
        push("Link copied to clipboard", "success");
      }
    } catch {
      /* user cancelled share */
    }
  };

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
    addToCart({
      productId: product.id,
      name: product.name,
      image: product.images[0],
      unitPrice: finalPrice,
      size,
      stockQty: product.stockQty,
    });
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
        <div className="flex gap-2">
          <button
            type="button"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            onClick={() => toggle(product.id)}
            className="flex size-10 items-center justify-center rounded-full bg-card shadow-soft"
          >
            <Heart
              className={cn("size-5", isFavorite ? "fill-favorite text-favorite" : "text-ink")}
            />
          </button>
          <button
            type="button"
            aria-label="Share"
            onClick={share}
            className="flex size-10 items-center justify-center rounded-full bg-card shadow-soft"
          >
            <Share2 className="size-5" />
          </button>
        </div>
      </header>

      <div className="space-y-5 px-4 pb-32 pt-2">
        <Gallery images={product.images} alt={product.name} />

        {/* info block */}
        <div className="space-y-2.5">
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

          <RatingRow rating={product.rating} reviewCount={product.reviewCount} />
          <StockBadge
            status={product.status}
            label={stockDetailLabel(product.status, product.stockQty)}
          />
          <p className="text-sm leading-relaxed text-ink/80">{product.description}</p>
        </div>

        {/* size selector */}
        {product.sizes && (
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-ink">Select Size</h2>
            <SizeSelector sizes={product.sizes} value={size} onChange={setLocalSize} />
          </div>
        )}

        {/* contact icons row */}
        {links && (
          <div className="space-y-2 text-center">
            <div className="flex justify-center gap-4">
              <a
                href={links.whatsapp}
                target="_blank"
                rel="noreferrer"
                aria-label="Ask on WhatsApp"
                className="flex size-12 items-center justify-center rounded-full bg-whatsapp text-white shadow-soft transition-transform active:scale-90"
              >
                <WhatsAppIcon className="size-5" />
              </a>
              <a
                href={links.instagram}
                target="_blank"
                rel="noreferrer"
                aria-label="Ask on Instagram"
                className="flex size-12 items-center justify-center rounded-full bg-instagram text-white shadow-soft transition-transform active:scale-90"
              >
                <InstagramIcon className="size-5" />
              </a>
              <a
                href={links.facebook}
                target="_blank"
                rel="noreferrer"
                aria-label="Ask on Facebook"
                className="flex size-12 items-center justify-center rounded-full bg-facebook text-white shadow-soft transition-transform active:scale-90"
              >
                <FacebookIcon className="size-5" />
              </a>
            </div>
            <p className="text-xs font-medium text-muted">Ask about this product</p>
          </div>
        )}

        {/* add to favorites */}
        <Button
          variant="outline"
          size="lg"
          className={cn("w-full", isFavorite && "border-favorite text-favorite")}
          onClick={() => toggle(product.id)}
        >
          <Heart className={cn("size-5", isFavorite && "fill-favorite")} />
          {isFavorite ? "Saved to Favorites ♥" : "Add to Favorites"}
        </Button>
      </div>

      {/* primary CTA — floating glass bar echoing the nav pill */}
      <div className="glass fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-[398px] -translate-x-1/2 gap-2 rounded-full p-2">
        <Button
          variant="outline"
          size="lg"
          className="flex-1 rounded-full border-white/60 bg-white/70"
          disabled={soldOut}
          onClick={handleAddToCart}
        >
          <ShoppingBag className="size-5" />
          Add to Cart
        </Button>
        <Button size="lg" className="flex-1 rounded-full" disabled={soldOut} onClick={orderNow}>
          {soldOut ? "Sold Out" : "Buy Now"}
          {!soldOut && <ArrowRight className="size-5" />}
        </Button>
      </div>
    </MobileShell>
  );
}
