import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Minus, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { z } from "zod";
import { Captcha } from "@/components/auth/Captcha";
import { useCaptcha } from "@/hooks/useCaptcha";
import { orderErrorMessage } from "@/lib/orderErrors";
import { MobileShell } from "@/components/layout/MobileShell";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes, variantPrice } from "@/lib/currency";
import { variantLabel } from "@/lib/variant";
import { orderLink } from "@/lib/deeplinks";
import { isValidPhone } from "@/lib/phone";
import { productImageSrc } from "@/lib/productImage";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { ProductImage } from "@/components/product/ProductImage";
import type { PaymentMethod } from "@/types";
import { useOrderStore } from "@/stores/order";
import { useOrderHistory } from "@/stores/orderHistory";
import { useShopHome } from "@/stores/shop";
import { useToasts } from "@/stores/toast";
import { PaymentSheet } from "./PaymentSheet";

const customerSchema = z.object({
  name: z.string().min(2, "Enter your full name"),
  phone: z
    .string()
    .refine(isValidPhone, "Enter a valid phone number, with country code (e.g. +254712345678)"),
  notes: z.string().max(300).optional().default(""),
});

type CustomerForm = z.infer<typeof customerSchema>;
type Channel = "whatsapp" | "instagram" | "facebook";

const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
};

const channels: { id: Channel; label: string; icon: typeof WhatsAppIcon }[] = [
  { id: "whatsapp", label: "WhatsApp", icon: WhatsAppIcon },
  { id: "instagram", label: "Instagram", icon: InstagramIcon },
  { id: "facebook", label: "Facebook", icon: FacebookIcon },
];

export function OrderPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const push = useToasts((s) => s.push);
  const home = useShopHome();

  const productQ = useQuery({
    queryKey: ["product", id],
    queryFn: () => services.products.getProduct(id),
  });
  const product = productQ.data;
  const shopSlug = product?.shopSlug ?? null;
  const merchantQ = useQuery({
    queryKey: ["shop", shopSlug],
    queryFn: () => services.products.getShop(shopSlug!),
    enabled: Boolean(shopSlug),
  });

  const { selectedSize, selectedColor, qty, setQty, customer, saveCustomer, preferredChannel } =
    useOrderStore();
  const addOrder = useOrderHistory((s) => s.add);
  // Desktop product page lets a buyer pick their channel before they get
  // here — respect it instead of always starting on WhatsApp.
  const [channel, setChannel] = useState<Channel>(preferredChannel ?? "whatsapp");
  const [payOpen, setPayOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  const captcha = useCaptcha();

  // One key per order attempt, reused across retries — see CheckoutPage for why
  // it must not be regenerated when an attempt fails.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [pendingNotify, setPendingNotify] = useState<{
    channel: Channel;
    label: string;
    url: string;
    message: string;
  } | null>(null);

  const {
    register,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: customer,
    mode: "onBlur",
  });

  const merchant = merchantQ.data;

  // Default to the seller's first configured channel — the buyer can only
  // pick among channels the seller actually set up (see the disabled state
  // in the selector below).
  useEffect(() => {
    if (!merchant || merchant.contacts[channel]) return;
    const firstAvailable = channels.find((c) => merchant.contacts[c.id]);
    if (firstAvailable) setChannel(firstAvailable.id);
  }, [merchant, channel]);

  // A qty carried over from a previous product (via the persisted order
  // store) can exceed this product's stock — the +/- buttons only clamped
  // on increment, not on load. Clamp whenever the product changes.
  useEffect(() => {
    if (product && product.stockQty > 0 && qty > product.stockQty) {
      setQty(product.stockQty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (productQ.isLoading || !merchant) {
    return (
      <MobileShell nav={false}>
        <div className="space-y-4 p-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </MobileShell>
    );
  }

  if (!product) {
    return (
      <MobileShell nav={false}>
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-lg font-bold text-ink">Product not found</p>
          <Link to={home} className="font-semibold text-primary">
            Back to store
          </Link>
        </div>
      </MobileShell>
    );
  }

  const unitPrice = variantPrice(product, selectedSize, selectedColor);
  const total = unitPrice * qty;

  const recordOrder = (
    reference: string,
    accessToken: string | null,
    paymentMethod: PaymentMethod | null,
    ch: Channel | "direct",
  ) => {
    addOrder({
      reference,
      accessToken: accessToken ?? undefined,
      productId: product.id,
      productName: product.name,
      image: productImageSrc(product.images),
      size: selectedSize,
      color: selectedColor,
      qty,
      totalKes: total,
      channel: ch,
      paymentMethod,
      placedAt: new Date().toISOString(),
    });
  };

  // Creates the real DB order (pending) and returns its server-generated
  // reference — the single source of truth used everywhere downstream
  // (local order history, the WhatsApp/IG/FB message, the payment sheet).
  const createOrder = (data: { name: string; phone: string; notes?: string }, ch: Channel | "direct") =>
    services.orders.submitOrder({
      productId: product.id,
      size: selectedSize,
      color: selectedColor,
      qty,
      customer: { name: data.name, phone: data.phone, notes: data.notes ?? "" },
      channel: ch,
      payment: null,
      idempotencyKey,
      captchaToken: captcha.token,
    });

  const openPayment = async () => {
    // A double-tap on this async handler used to place two orders and take
    // stock twice.
    if (placing) return;

    const valid = await trigger();
    if (!valid) {
      push("Fill in your details first");
      return;
    }
    const data = getValues();
    saveCustomer({ name: data.name, phone: data.phone, notes: data.notes ?? "" });
    setPlacing(true);
    try {
      const { reference, accessToken } = await createOrder(data, "direct");
      setPendingReference(reference);
      setPendingToken(accessToken);
      // Pre-build the seller notification for the chosen channel now, while
      // we still have the reference — PaymentSheet fires it automatically
      // once payment succeeds, so there's no separate "send order" step.
      const { url, message } = orderLink(
        merchant,
        product,
        {
          size: selectedSize,
          color: selectedColor,
          qty,
          name: data.name,
          phone: data.phone,
          notes: data.notes ?? "",
        },
        channel,
        reference,
      );
      setPendingNotify({ channel, label: CHANNEL_LABEL[channel], url, message });
      setPayOpen(true);
    } catch (err) {
      push(orderErrorMessage(err), "danger");
      // Single-use token — reissue, or the retry fails on the captcha instead
      // of on whatever actually went wrong. The idempotency key is kept (see
      // CheckoutPage): a retry must be able to replay a lost-but-committed order.
      captcha.reset();
    } finally {
      setPlacing(false);
    }
  };

  return (
    <MobileShell nav={false}>
      <header className="glass-header sticky top-0 z-30 flex items-center gap-3 px-3 py-3">
        {/* mobile's back lives in the floating button (MobileShell) */}
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate(-1)}
          className="hidden size-11 items-center justify-center rounded-full bg-card shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:flex"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-base font-extrabold text-ink">Place Order</h1>
      </header>

      <div className="space-y-4 px-4 pb-10 pt-1">
        {/* product summary */}
        <div className="flex gap-3 rounded-card bg-card p-3 shadow-soft">
          <ProductImage
            src={product.images[0]}
            alt={product.name}
            className="size-20 rounded-xl object-cover"
          />
          <div className="flex flex-1 flex-col justify-between py-0.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-ink">{product.name}</p>
                <p className="text-xs text-muted">
                  {variantLabel(selectedSize, selectedColor)
                    ? `${variantLabel(selectedSize, selectedColor)} · `
                    : ""}
                  Qty {qty}
                </p>
              </div>
              <Link
                to={`/product/${product.id}`}
                aria-label="Edit selection"
                className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-stone-100"
              >
                <Pencil className="size-4" />
              </Link>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold text-primary">{formatKes(total)}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQty(qty - 1)}
                  disabled={qty <= 1}
                  className="flex size-7 items-center justify-center rounded-full bg-stone-100 disabled:opacity-40"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="w-5 text-center text-sm font-bold">{qty}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQty(Math.min(qty + 1, product.stockQty))}
                  className="flex size-7 items-center justify-center rounded-full bg-stone-100"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* customer fields */}
        <div className="space-y-3 rounded-card bg-card p-4 shadow-soft">
          <h2 className="text-sm font-bold text-ink">Your details</h2>
          <Input
            label="Full Name"
            placeholder="Jane Wanjiku"
            error={errors.name?.message}
            {...register("name")}
          />
          <Input
            label="Phone"
            placeholder="+254 712 345 678"
            inputMode="tel"
            error={errors.phone?.message}
            {...register("phone")}
          />
          <Textarea
            label="Notes (optional)"
            placeholder="Delivery location, color preference…"
            error={errors.notes?.message}
            {...register("notes")}
          />
        </div>

        {/* channel selector + context notice — only channels the seller set up are pickable */}
        <div className="space-y-3 rounded-card bg-card p-4 shadow-soft">
          <div className="grid grid-cols-3 gap-2 rounded-btn bg-stone-100 p-1">
            {channels.map(({ id: ch, label, icon: Icon }) => {
              const available = Boolean(merchant.contacts[ch]);
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => available && setChannel(ch)}
                  disabled={!available}
                  aria-label={available ? label : `${label} — not set up by this seller`}
                  className={cn(
                    "flex h-10 items-center justify-center gap-1.5 rounded-[10px] text-xs font-bold transition-all",
                    !available && "cursor-not-allowed opacity-35",
                    available && channel === ch ? "bg-card text-ink shadow-soft" : "text-muted",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4",
                      available && ch === "whatsapp" && "text-whatsapp",
                      available && ch === "instagram" && "text-instagram",
                      available && ch === "facebook" && "text-facebook",
                    )}
                  />
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Once you pay, your order will be sent to{" "}
            <span className="font-bold text-ink">{merchant.name}</span> via{" "}
            <span className="font-bold text-ink capitalize">{channel}</span>. They'll confirm
            stock and delivery.
          </p>
        </div>

        {/* Captcha-gated: placing an order takes stock before payment. */}
        <Captcha
          key={captcha.nonce}
          onToken={captcha.setToken}
          onExpire={() => captcha.setToken(undefined)}
        />

        <Button
          variant="dark"
          size="lg"
          className="w-full"
          onClick={openPayment}
          disabled={placing || !captcha.ready}
        >
          {placing ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              PLACING ORDER…
            </>
          ) : (
            "COMPLETE ORDER — PAY NOW"
          )}
        </Button>
      </div>

      <PaymentSheet
        open={payOpen}
        onOpenChange={setPayOpen}
        amount={total}
        defaultPhone={getValues("phone") || customer.phone}
        merchantName={merchant.name}
        orderReference={pendingReference ?? ""}
        notify={pendingNotify}
        onPaid={(method) => {
          if (!pendingReference) return;
          recordOrder(pendingReference, pendingToken, method, channel);
        }}
      />
    </MobileShell>
  );
}
