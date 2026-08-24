import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowLeft,
  CircleCheck,
  Loader2,
  Lock,
  Phone,
  ShieldCheck,
  Star,
} from "lucide-react";
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
import { FacebookIcon, InstagramIcon, PayPalIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
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
import { activeShareCode, useAttribution } from "@/stores/attribution";
import { type AppliedDiscount, DiscountCodeSection } from "@/components/cart/DiscountCodeSection";
import type { PaymentMethod } from "@/types";
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

/**
 * The payment methods offered on the page.
 *
 * Deliberately only the two the platform can actually charge (see
 * PaymentMethod in @/types). A checkout that shows a wallet button it cannot
 * complete costs more trust at this exact step than the extra logo buys.
 * Brand marks keep their own colours — a teal PayPal mark is not PayPal — while
 * every piece of UI chrome around them takes the brand accent.
 */
type AnyIcon = LucideIcon | typeof PayPalIcon;

const payMethods: {
  id: PaymentMethod;
  label: string;
  hint: string;
  icon: AnyIcon;
  iconClass: string;
}[] = [
  {
    id: "mpesa",
    label: "M-Pesa",
    hint: "STK push to your phone",
    icon: Phone,
    iconClass: "text-success",
  },
  {
    id: "paypal",
    label: "PayPal",
    hint: "Card or PayPal balance",
    icon: PayPalIcon,
    iconClass: "text-facebook",
  },
];

/** Claims the platform can actually back, under the pay button. */
const trustMarks: { label: string; icon: LucideIcon }[] = [
  { label: "SSL encrypted", icon: Lock },
  { label: "Secure payment", icon: ShieldCheck },
  { label: "Seller confirms", icon: CircleCheck },
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
  // Chosen on the page (the summary panel) and handed to the sheet, so the
  // buyer is not asked which method twice.
  const [payMethod, setPayMethod] = useState<PaymentMethod>("mpesa");
  const [payOpen, setPayOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  // Discount code — applied via preview_discount_code (advisory) before
  // submit; place_order re-validates and re-computes authoritatively, so a
  // code that stops qualifying between here and submit is caught there, not
  // here (see the catch block in openPayment). A code the shopper applied in
  // the cart arrives via the store and is re-validated on mount.
  const storedCode = useCart((s) => s.discountCode);
  const setStoredCode = useCart((s) => s.setDiscountCode);
  const [applied, setApplied] = useState<AppliedDiscount | null>(null);

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
      <MobileShell nav={false} wide>
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
  // Units, not lines: "3 items" beside a two-line list is what the shopper
  // counts in their hands.
  const itemCount = items.reduce((n, i) => n + i.qty, 0);
  // Subtracted from the cart's own total rather than trusting the preview's
  // `newTotal` directly — the preview ignores variant price adjustments, so
  // deriving the shown total from the number the cart already computed keeps
  // Subtotal/Discount/Total internally consistent even when that estimate is
  // slightly conservative. The actual charge is always computed correctly by
  // place_order regardless of what's shown here.
  const discountKes = applied?.preview.valid ? applied.preview.discountKes : 0;
  const displayTotal = Math.max(0, total - discountKes);

  const clearDiscount = () => {
    setApplied(null);
    setStoredCode(null);
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
      discountCode: applied?.preview.valid ? applied.code : undefined,
      // Which shared link brought this buyer in, if any. Read through
      // activeShareCode() rather than off the store so the 30-day window is
      // applied — see stores/attribution.ts.
      shareCode: activeShareCode(),
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
    // `wide` past lg: two columns, mirroring a desktop checkout — order + form
    // on the left, the payment receipt pinned on the right where the pay button
    // sits at the end of the reading.
    <MobileShell nav={false} wide>
      <header className="glass-header sticky top-0 z-30 flex items-center gap-3 px-3 py-3 lg:px-6">
        {/* mobile's back lives in the floating button (MobileShell) */}
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate(-1)}
          className="hidden size-11 items-center justify-center rounded-full bg-card shadow-soft transition-transform hover:-translate-x-0.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:flex"
        >
          <ArrowLeft className="size-5" />
        </button>
        <span className="text-base font-extrabold text-ink">Checkout</span>
        {/* the desktop mark lives beside the page title instead */}
        <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-primary lg:hidden">
          <Lock className="size-3.5" aria-hidden />
          Secure
        </span>
      </header>

      <div className="px-4 pb-10 pt-3 lg:px-6 lg:pb-14 lg:pt-6">
        {/* The page's own title, centred, with the security mark held out to the
            right — the buyer's eye lands on the words, not on the badge. */}
        <div className="relative mb-6 flex items-center justify-center lg:mb-9">
          <h1 className="text-center text-[26px] leading-tight text-ink lg:text-[34px]">
            Secure checkout
          </h1>
          <span className="absolute right-0 hidden items-center gap-2 rounded-btn border border-primary/25 bg-primary/[0.07] px-3 py-1.5 text-sm font-semibold text-primary lg:flex">
            <Lock className="size-4" aria-hidden />
            Secure
          </span>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,392px)] lg:items-start lg:gap-7">
          {/* ================= LEFT: order + shipping ================= */}
          <div className="space-y-4 lg:order-1">
            {/* ---------------- your order summary ---------------- */}
            <section className="overflow-hidden rounded-card border border-line-soft bg-card shadow-soft">
              <div className="flex items-baseline justify-between gap-3 border-b border-line-soft px-5 py-4">
                <h2 className="text-xl text-ink">Your order summary</h2>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-muted">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              </div>

              {/* Who you are buying from. The cart is single-shop, so this is
                  one named seller — and naming them here is what makes the
                  receipt read as a deal with a person rather than a form. */}
              <div className="flex items-center gap-3 border-b border-line-soft bg-fill-soft px-5 py-3">
                <img
                  src={merchant.avatarUrl}
                  alt=""
                  className="size-9 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-ink">{merchant.name}</p>
                  <div className="flex items-center gap-1.5">
                    {/* A shop with no ratings yet gets its handle and nothing
                        else. Five empty stars beside a "0.0" reads as a badly
                        rated seller, which is the opposite of true — and this
                        is the last screen before someone pays. */}
                    {merchant.stats.rating > 0 && (
                      <>
                        <div className="flex items-center gap-0.5" aria-hidden>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={cn(
                                "size-3",
                                n <= Math.round(merchant.stats.rating)
                                  ? "fill-amber-400 text-amber-400"
                                  : "fill-line text-line",
                              )}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-semibold tabular-nums text-ink">
                          {merchant.stats.rating.toFixed(1)}
                        </span>
                      </>
                    )}
                    <span className="text-xs font-medium text-muted">@{merchant.handle}</span>
                  </div>
                </div>
              </div>

              {/* Numbered lines — thumbnail / name+variant / qty / price. The
                  four columns line up down the list so the eye can total it. */}
              <ol className="divide-y divide-line-soft">
                {items.map((item, i) => (
                  <li
                    key={`${item.productId}-${variantKey(item.size, item.color)}`}
                    className="flex items-center gap-2.5 px-4 py-3.5 sm:gap-4 sm:px-5 sm:py-4"
                  >
                    <span className="w-4 shrink-0 text-sm font-semibold tabular-nums text-muted">
                      {i + 1}.
                    </span>
                    <ProductImage
                      src={item.image}
                      alt={item.name}
                      className="size-12 shrink-0 rounded-lg border border-line-soft object-cover sm:size-16"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
                        {item.name}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {variantLabel(item.size, item.color) || "Standard"}
                        {/* qty rides along on phones, where its own column
                            would squeeze the name down to two words */}
                        <span className="tabular-nums sm:hidden"> · Qty {item.qty}</span>
                      </p>
                    </div>
                    <span className="hidden w-16 shrink-0 text-sm tabular-nums text-muted sm:block">
                      Qty: {item.qty}
                    </span>
                    <span className="min-w-[76px] shrink-0 text-right text-sm font-bold tabular-nums text-ink sm:w-24 sm:text-[15px]">
                      {formatKes(item.unitPrice * item.qty)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            {/* ---------------- shipping & contact information ---------------- */}
            <section className="overflow-hidden rounded-card border border-line-soft bg-card shadow-soft">
              <div className="border-b border-line-soft px-5 py-4">
                <h2 className="text-xl text-ink">Shipping &amp; contact information</h2>
              </div>

              <div className="grid gap-6 px-5 py-5 md:grid-cols-2 md:gap-7">
                {/* left half — the fields */}
                <div className="space-y-3.5">
                  <p className="text-sm font-bold text-ink">Your details</p>
                  <Input
                    label="Full name"
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
                </div>

                {/* right half — delivery, then the channel the seller replies on */}
                <div className="space-y-3.5">
                  <p className="text-sm font-bold text-ink">Delivery options</p>
                  {/* Sellers arrange and price delivery themselves over the
                      chosen channel, so this names the options the shop offers
                      rather than quoting a figure PulseShop cannot stand
                      behind. */}
                  <div className="flex items-start gap-3 rounded-btn border border-primary/30 bg-primary/[0.06] px-3.5 py-3">
                    <span
                      className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 border-primary"
                      aria-hidden
                    >
                      <span className="size-2 rounded-full bg-primary" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize text-ink">
                        {fulfillmentLabel(merchant.fulfillment)}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">
                        Cost and timing are agreed with the seller once they confirm your order.
                      </p>
                    </div>
                  </div>

                  <p className="pt-1 text-sm font-bold text-ink">Where the seller reaches you</p>
                  <div className="grid grid-cols-3 gap-2 rounded-btn bg-fill p-1">
                    {channels.map(({ id: ch, label, icon: Icon }) => {
                      const available = Boolean(merchant.contacts[ch]);
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => available && setChannel(ch)}
                          disabled={!available}
                          aria-label={available ? label : `${label}, not set up by this seller`}
                          className={cn(
                            "flex h-11 items-center justify-center gap-1.5 rounded-[10px] text-xs font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                            !available && "cursor-not-allowed opacity-35",
                            available && channel === ch
                              ? "bg-card text-ink shadow-soft"
                              : "text-muted hover:text-ink",
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
                    Once you pay, your order goes to{" "}
                    <span className="font-bold text-ink">{merchant.name}</span> via{" "}
                    <span className="font-bold text-ink">{CHANNEL_LABEL[channel]}</span>. They
                    confirm
                    stock and delivery with you.
                  </p>
                </div>
              </div>

              {/* order notes — full width beneath both halves */}
              <div className="border-t border-line-soft px-5 py-5">
                <Textarea
                  label="Order notes / special instructions"
                  placeholder="Estate or building, landmark, preferred delivery time, gift message…"
                  error={errors.notes?.message}
                  {...register("notes")}
                />
              </div>
            </section>
          </div>

          {/* ================= RIGHT: payment summary ================= */}
          <aside className="mt-4 space-y-3 lg:sticky lg:top-24 lg:order-2 lg:mt-0">
            <div className="overflow-hidden rounded-card border border-line-soft bg-card shadow-soft">
              <div className="border-b border-line-soft px-5 py-4">
                <h2 className="text-xl text-ink">Payment summary</h2>
              </div>

              {/* Itemised, always. A lone "Total" with nothing above it reads as
                  a number the page made up; Subtotal shows even at full price so
                  the arithmetic is visible either way. */}
              <div className="space-y-2.5 px-5 py-4">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">
                    Subtotal{" "}
                    <span className="tabular-nums">
                      ({itemCount} {itemCount === 1 ? "item" : "items"})
                    </span>
                  </span>
                  <span className="font-medium tabular-nums text-ink">{formatKes(total)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">Delivery</span>
                  <span className="text-right font-medium text-ink">Arranged with seller</span>
                </div>
                {applied?.preview.valid && (
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-muted">Promo code ({applied.code})</span>
                    <span className="shrink-0 font-semibold tabular-nums text-primary">
                      −{formatKes(discountKes)}
                    </span>
                  </div>
                )}
                <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line-soft pt-3">
                  <span className="text-base font-extrabold text-ink">Order total</span>
                  <span className="text-xl font-extrabold tabular-nums text-ink">
                    {formatKes(displayTotal)}
                  </span>
                </div>
              </div>

              {/* discount code */}
              <div className="border-t border-line-soft px-5 py-4">
                <DiscountCodeSection
                  merchantId={merchant.id}
                  items={items.map((i) => ({ productId: i.productId, qty: i.qty }))}
                  getPhone={() => getValues("phone") || undefined}
                  applied={applied}
                  onApply={(a) => {
                    setApplied(a);
                    setStoredCode(a.code);
                  }}
                  onClear={clearDiscount}
                  initialCode={storedCode}
                />
              </div>

              {/* ---------------- payment method ---------------- */}
              <div className="border-t border-line-soft px-5 py-4">
                <h3 className="font-sans-force mb-3 text-sm font-bold text-ink">Payment method</h3>
                {/* Picked here so the sheet opens straight onto the buyer's
                    choice instead of asking the same question twice. Only the
                    two methods the platform can actually charge are offered — a
                    dead wallet button on the pay screen is worse than none. */}
                <div role="radiogroup" aria-label="Payment method" className="space-y-2">
                  {payMethods.map(({ id, label, hint, icon: Icon, iconClass }) => {
                    const selected = payMethod === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPayMethod(id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-btn border px-3.5 py-3 text-left transition-all duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                          selected
                            ? "border-primary bg-primary/[0.06]"
                            : "border-line bg-card hover:border-primary/45",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            selected ? "border-primary" : "border-faint",
                          )}
                          aria-hidden
                        >
                          {selected && <span className="size-2 rounded-full bg-primary" />}
                        </span>
                        <Icon className={cn("size-5 shrink-0", iconClass)} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-ink">{label}</span>
                          <span className="block text-xs text-muted">{hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ---------------- place order ---------------- */}
              <div className="space-y-3 border-t border-line-soft px-5 py-4">
                {/* Order placement decrements stock before anyone has paid, so it is
                    captcha-gated like the auth forms. Renders nothing when no site key
                    is set (dev/mock), and the button stays enabled in that case. */}
                <Captcha
                  key={captcha.nonce}
                  onToken={captcha.setToken}
                  onExpire={() => captcha.setToken(undefined)}
                />

                {/* Carries the figure so nobody has to look back up the panel to
                    check what they are about to be charged. */}
                <Button
                  size="lg"
                  className="w-full text-[15px]"
                  onClick={openPayment}
                  disabled={placing || !captcha.ready || shopClosed}
                >
                  {placing ? (
                    <>
                      <Loader2 className="size-5 animate-spin" />
                      Placing order…
                    </>
                  ) : (
                    <>Place order · {formatKes(displayTotal)}</>
                  )}
                </Button>

                <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-0.5">
                  {trustMarks.map(({ label, icon: Icon }) => (
                    <li
                      key={label}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-muted"
                    >
                      <Icon className="size-3.5 shrink-0 text-primary" aria-hidden />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {shopClosed && (
              <div className="flex items-center gap-2 rounded-card border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
                <AlertTriangle className="size-4 shrink-0 text-warning" />
                <span className="text-ink">
                  <span className="font-bold">{merchant.name}</span> isn't accepting orders right
                  now.
                </span>
              </div>
            )}

            <p className="flex items-start justify-center gap-1.5 px-2 text-center text-xs leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Your order isn't complete until{" "}
                <span className="font-semibold text-ink">{merchant.name}</span> confirms stock and
                delivery with you.
              </span>
            </p>
          </aside>
        </div>

        {/* One more nudge before they pay — more from the same shop (the cart is
            single-shop), minus what's already in the cart. Full width under both
            columns: it is a browsing rail, not part of the checkout flow, and it
            must not push the order button further down the page. */}
        <div className="mt-6 lg:mt-12">
          <RecommendedProducts
            title="You may also like"
            shopId={merchant.id}
            exclude={items.map((i) => i.productId)}
            limit={6}
            layout="rail"
          />
        </div>
      </div>

      <PaymentSheet
        open={payOpen}
        onOpenChange={setPayOpen}
        amount={displayTotal}
        defaultPhone={getValues("phone") || customer.phone}
        defaultMethod={payMethod}
        merchantName={merchant.name}
        orderReference={pendingReference ?? ""}
        notify={pendingNotify}
        onPaid={(method) => {
          if (!pendingReference) return;
          recordOrders(pendingReference, pendingToken, method, channel);
          clearCart();
          // The link has been credited on the order; keeping it would let one
          // Status post claim every future order from this device too.
          useAttribution.getState().clear();
          navigate("/orders");
        }}
      />
    </MobileShell>
  );
}
