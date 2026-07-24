import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Loader2, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import { z } from "zod";
import { Captcha } from "@/components/auth/Captcha";
import { useCaptcha } from "@/hooks/useCaptcha";
import { orderErrorMessage } from "@/lib/orderErrors";
import { MobileShell } from "@/components/layout/MobileShell";
import { ProductImage } from "@/components/product/ProductImage";
import { RecommendedProducts } from "@/components/product/RecommendedProducts";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { fulfillmentLabel } from "@/lib/constants";
import { variantKey, variantLabel } from "@/lib/variant";
import { cartOrderLink } from "@/lib/deeplinks";
import { isValidPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { DiscountPreview, PaymentMethod } from "@/types";
import { useClearCart } from "@/hooks/useCart";
import { cartSubtotal, useCart } from "@/stores/cart";
import { useOrderStore } from "@/stores/order";
import { useOrderHistory } from "@/stores/orderHistory";
import { useShop } from "@/stores/shop";
import { useToasts } from "@/stores/toast";
import { PaymentSheet } from "@/routes/order/PaymentSheet";

const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
};

const customerSchema = z.object({
  name: z.string().min(2, "Enter your full name"),
  phone: z
    .string()
    .refine(isValidPhone, "Enter a valid phone number, with country code (e.g. +254712345678)"),
  notes: z.string().max(300).optional().default(""),
});

type CustomerForm = z.infer<typeof customerSchema>;
type Channel = "whatsapp" | "instagram" | "facebook";

const channels: { id: Channel; label: string; icon: typeof WhatsAppIcon }[] = [
  { id: "whatsapp", label: "WhatsApp", icon: WhatsAppIcon },
  { id: "instagram", label: "Instagram", icon: InstagramIcon },
  { id: "facebook", label: "Facebook", icon: FacebookIcon },
];

export function CheckoutPage() {
  const navigate = useNavigate();
  const push = useToasts((s) => s.push);

  const items = useCart((s) => s.items);
  const clearCart = useClearCart();
  const { customer, saveCustomer } = useOrderStore();
  const addOrder = useOrderHistory((s) => s.add);
  const activeSlug = useShop((s) => s.slug);

  // The cart holds items from one shop; resolve that shop publicly by its
  // handle so guest shoppers can check out. (Falls back to the shop being
  // browsed for carts persisted before items carried a shopSlug.)
  const shopSlug = items[0]?.shopSlug ?? activeSlug;
  const merchantQ = useQuery({
    queryKey: ["shop", shopSlug],
    queryFn: () => services.products.getShop(shopSlug!),
    enabled: Boolean(shopSlug),
  });
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [payOpen, setPayOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  // Discount code — applied via preview_discount_code (advisory) before
  // submit; place_order re-validates and re-computes authoritatively, so a
  // code that stops qualifying between here and submit is caught there, not
  // here (see the catch block in openPayment).
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [discountChecking, setDiscountChecking] = useState(false);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountPreview | null>(null);

  const captcha = useCaptcha();

  // One key per checkout attempt, minted when the page mounts and reused across
  // retries — see the catch block in openPayment for why it must NOT be
  // regenerated on failure. useState's initialiser, not a plain call: a fresh
  // key on every render would make every retry look like a new order.
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

  // Default to the seller's first configured channel — the buyer can only
  // pick among channels the seller actually set up (see the disabled state
  // in the selector below).
  const merchantContacts = merchantQ.data?.contacts;
  useEffect(() => {
    if (!merchantContacts || merchantContacts[channel]) return;
    const firstAvailable = channels.find((c) => merchantContacts[c.id]);
    if (firstAvailable) setChannel(firstAvailable.id);
  }, [merchantContacts, channel]);

  // Nothing to check out — bounce back to the cart.
  if (items.length === 0) return <Navigate to="/cart" replace />;

  // Carts saved before items carried their shop can't be routed — start over.
  if (!shopSlug) return <Navigate to="/cart" replace />;

  const merchant = merchantQ.data;
  if (!merchant) {
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

  // place_order is the real gate (it rejects any non-'open' shop server-side);
  // this just stops a buyer from filling in the whole form only to hit that
  // error at the very last step.
  const shopClosed = merchant.shopStatus !== "open";

  const total = cartSubtotal(items);
  // Subtracted from the cart's own total rather than trusting the preview's
  // `newTotal` directly — the preview ignores variant price adjustments, so
  // deriving the shown total from the number the cart already computed keeps
  // Subtotal/Discount/Total internally consistent even when that estimate is
  // slightly conservative. The actual charge is always computed correctly by
  // place_order regardless of what's shown here.
  const discountKes = appliedDiscount?.valid ? appliedDiscount.discountKes : 0;
  const displayTotal = Math.max(0, total - discountKes);

  const clearDiscount = () => {
    setAppliedCode(null);
    setAppliedDiscount(null);
    setDiscountInput("");
    setDiscountError(null);
    setDiscountOpen(false);
  };

  const applyDiscount = async () => {
    const code = discountInput.trim();
    if (!code) return;
    setDiscountChecking(true);
    setDiscountError(null);
    try {
      const result = await services.discounts.previewCode(
        merchant.id,
        code,
        items.map((i) => ({ productId: i.productId, qty: i.qty })),
        getValues("phone") || undefined,
      );
      if (result.valid) {
        setAppliedCode(code.toUpperCase());
        setAppliedDiscount(result);
      } else {
        setAppliedDiscount(null);
        setDiscountError(result.reason ?? "This code isn't valid for this order.");
      }
    } catch {
      setDiscountError("Couldn't check that code — try again.");
    } finally {
      setDiscountChecking(false);
    }
  };

  const recordOrders = (
    reference: string,
    accessToken: string | null,
    paymentMethod: PaymentMethod | null,
    ch: Channel | "direct",
  ) => {
    const placedAt = new Date().toISOString();
    // This is a LOCAL convenience cache (the guest's /orders list, since only
    // signed-in buyers get the server's own history) — it doesn't know which
    // lines a code actually applied to, only the order-wide total. Scaling
    // every line by the same ratio keeps the displayed lines summing to what
    // was actually charged, rather than showing the pre-discount amount. The
    // real per-line breakdown is always correct on the order lookup page,
    // which this record's reference + accessToken can always reach.
    const discountRatio = total > 0 ? displayTotal / total : 1;
    for (const item of items) {
      addOrder({
        reference,
        accessToken: accessToken ?? undefined,
        productId: item.productId,
        productName: item.name,
        image: item.image,
        size: item.size,
        color: item.color,
        qty: item.qty,
        totalKes: Math.round(item.unitPrice * item.qty * discountRatio),
        channel: ch,
        paymentMethod,
        placedAt,
      });
    }
  };

  // Creates the real DB order (pending) and returns its server-generated
  // reference — the single source of truth used everywhere downstream
  // (local order history, the WhatsApp/IG/FB message, the payment sheet).
  const createOrder = (data: { name: string; phone: string; notes?: string }, ch: Channel | "direct") =>
    services.orders.submitCartOrder({
      shopSlug,
      items: items.map((i) => ({
        productId: i.productId,
        size: i.size,
        color: i.color,
        qty: i.qty,
      })),
      customer: { name: data.name, phone: data.phone, notes: data.notes ?? "" },
      channel: ch,
      payment: null,
      idempotencyKey,
      captchaToken: captcha.token,
      discountCode: appliedDiscount?.valid ? appliedCode : undefined,
    });

  const openPayment = async () => {
    // Guard the whole submit, not just the button: an async handler fired twice
    // by a double-tap used to place two orders and decrement stock twice (the
    // idempotency key below makes the server side of that safe too).
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
      const { url, message } = cartOrderLink(
        merchant,
        items.map((i) => ({
          name: i.name,
          size: i.size,
          color: i.color,
          qty: i.qty,
          unitPrice: i.unitPrice,
        })),
        { name: data.name, phone: data.phone, notes: data.notes ?? "" },
        channel,
        reference,
      );
      setPendingNotify({ channel, label: CHANNEL_LABEL[channel], url, message });
      setPayOpen(true);
    } catch (err) {
      // The server's reason is the useful one ("insufficient stock for X",
      // "captcha_failed") — a generic connection message would send the shopper
      // to retry something that will never succeed.
      push(orderErrorMessage(err), "danger");
      // A code that stopped qualifying in the seconds between preview and
      // submit (last redemption slot taken, buyer used it elsewhere) must not
      // block the order entirely — clear it so a resubmit goes through at
      // full price instead of hitting the exact same rejection again.
      if (err instanceof Error && err.message.toLowerCase().includes("discount code")) {
        clearDiscount();
      }
      // Turnstile tokens are single-use; a spent one must be reissued or the
      // retry fails on the captcha instead of on whatever actually broke.
      captcha.reset();
      // The idempotency key is deliberately NOT regenerated here. The server
      // records it only when the order commits, so retrying with the same key
      // is right either way: if the order never happened, the retry places it;
      // if it DID happen and we merely lost the response (dropped connection —
      // the common case on a phone), the retry replays that same order instead
      // of buying a second one. A fresh key would turn that into a double order.
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
        <h1 className="text-base font-extrabold text-ink">Checkout</h1>
      </header>

      <div className="space-y-4 px-4 pb-10 pt-1">
        {/* order summary */}
        <div className="space-y-3 rounded-card bg-card p-4 shadow-soft">
          <h2 className="text-sm font-bold text-ink">Order summary</h2>
          {items.map((item) => (
            <div
              key={`${item.productId}-${variantKey(item.size, item.color)}`}
              className="flex items-center gap-3"
            >
              <ProductImage src={item.image} alt={item.name} className="size-12 rounded-lg object-cover" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">{item.name}</p>
                <p className="text-xs text-muted">
                  {variantLabel(item.size, item.color) ? `${variantLabel(item.size, item.color)} · ` : ""}
                  Qty {item.qty}
                </p>
              </div>
              <p className="text-sm font-bold text-ink">{formatKes(item.unitPrice * item.qty)}</p>
            </div>
          ))}

          {/* discount code */}
          <div className="border-t border-stone-100 pt-3">
            {appliedCode && appliedDiscount?.valid ? (
              <div className="flex items-center justify-between rounded-btn bg-success/5 px-3 py-2">
                <span className="text-sm font-semibold text-success">
                  "{appliedCode}" applied — {appliedDiscount.percentOff}% off
                </span>
                <button
                  type="button"
                  onClick={clearDiscount}
                  className="text-xs font-bold text-muted underline underline-offset-2 hover:text-ink"
                >
                  Remove
                </button>
              </div>
            ) : discountOpen ? (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={discountInput}
                    onChange={(e) => {
                      setDiscountInput(e.target.value);
                      setDiscountError(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyDiscount())}
                    placeholder="Discount code"
                    aria-label="Discount code"
                    className="h-10 flex-1 rounded-btn border border-stone-200 bg-card px-3 text-sm uppercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={applyDiscount}
                    disabled={!discountInput.trim() || discountChecking}
                    className="flex items-center gap-1.5 rounded-btn bg-ink px-4 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {discountChecking && <Loader2 className="size-4 animate-spin" />}
                    Apply
                  </button>
                </div>
                {discountError && <p className="text-xs font-semibold text-danger">{discountError}</p>}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDiscountOpen(true)}
                className="text-sm font-bold text-primary"
              >
                Have a discount code?
              </button>
            )}
          </div>

          <div className="space-y-1.5 border-t border-stone-100 pt-3">
            {appliedCode && appliedDiscount?.valid && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Subtotal</span>
                  <span className="text-ink">{formatKes(total)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Discount ({appliedCode})</span>
                  <span className="font-semibold text-success">−{formatKes(discountKes)}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-ink">Total</span>
              <span className="text-lg font-extrabold text-primary">{formatKes(displayTotal)}</span>
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
                    "flex h-11 items-center justify-center gap-1.5 rounded-[10px] text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
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
            <span className="font-bold text-ink capitalize">{channel}</span>. They'll confirm stock
            and delivery.
          </p>
          <div className="flex items-center gap-2 rounded-btn bg-stone-50 px-3 py-2 text-xs">
            <Truck className="size-4 shrink-0 text-primary" />
            <span className="text-muted">
              This shop offers{" "}
              <span className="font-bold text-ink">{fulfillmentLabel(merchant.fulfillment)}</span>.
            </span>
          </div>
        </div>

        {shopClosed && (
          <div className="flex items-center gap-2 rounded-card border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            <span className="text-ink">
              <span className="font-bold">{merchant.name}</span> isn't accepting orders right now.
            </span>
          </div>
        )}

        {/* Order placement decrements stock before anyone has paid, so it is
            captcha-gated like the auth forms. Renders nothing when no site key
            is set (dev/mock), and the button stays enabled in that case. */}
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
          disabled={placing || !captcha.ready || shopClosed}
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

        {/* One more nudge before they pay — more from the same shop (the cart is
            single-shop), minus what's already in the cart. */}
        <RecommendedProducts
          title="You may also like"
          shopId={merchant.id}
          exclude={items.map((i) => i.productId)}
          limit={6}
          layout="rail"
        />
      </div>

      <PaymentSheet
        open={payOpen}
        onOpenChange={setPayOpen}
        amount={displayTotal}
        defaultPhone={getValues("phone") || customer.phone}
        merchantName={merchant.name}
        orderReference={pendingReference ?? ""}
        notify={pendingNotify}
        onPaid={(method) => {
          if (!pendingReference) return;
          recordOrders(pendingReference, pendingToken, method, channel);
          clearCart();
          navigate("/orders");
        }}
      />
    </MobileShell>
  );
}
