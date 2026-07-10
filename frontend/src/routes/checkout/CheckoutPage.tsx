import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import { z } from "zod";
import { MobileShell } from "@/components/layout/MobileShell";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { cartOrderLink } from "@/lib/deeplinks";
import { isValidPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { PaymentMethod } from "@/types";
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
  const clearCart = useCart((s) => s.clear);
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
  const [pendingReference, setPendingReference] = useState<string | null>(null);
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

  const total = cartSubtotal(items);

  const recordOrders = (reference: string, paymentMethod: PaymentMethod | null, ch: Channel | "direct") => {
    const placedAt = new Date().toISOString();
    for (const item of items) {
      addOrder({
        reference,
        productId: item.productId,
        productName: item.name,
        image: item.image,
        size: item.size,
        qty: item.qty,
        totalKes: item.unitPrice * item.qty,
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
      items: items.map((i) => ({ productId: i.productId, size: i.size, qty: i.qty })),
      customer: { name: data.name, phone: data.phone, notes: data.notes ?? "" },
      channel: ch,
      payment: null,
    });

  const openPayment = async () => {
    const valid = await trigger();
    if (!valid) {
      push("Fill in your details first");
      return;
    }
    const data = getValues();
    saveCustomer({ name: data.name, phone: data.phone, notes: data.notes ?? "" });
    try {
      const { reference } = await createOrder(data, "direct");
      setPendingReference(reference);
      // Pre-build the seller notification for the chosen channel now, while
      // we still have the reference — PaymentSheet fires it automatically
      // once payment succeeds, so there's no separate "send order" step.
      const { url, message } = cartOrderLink(
        merchant,
        items.map((i) => ({ name: i.name, size: i.size, qty: i.qty, unitPrice: i.unitPrice })),
        { name: data.name, phone: data.phone, notes: data.notes ?? "" },
        channel,
        reference,
      );
      setPendingNotify({ channel, label: CHANNEL_LABEL[channel], url, message });
      setPayOpen(true);
    } catch {
      push("Couldn't start checkout — check your connection and try again", "danger");
    }
  };

  return (
    <MobileShell nav={false}>
      <header className="glass-header sticky top-0 z-30 flex items-center gap-3 px-3 py-3">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate(-1)}
          className="flex size-10 items-center justify-center rounded-full bg-card shadow-soft"
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
              key={`${item.productId}-${item.size ?? "one"}`}
              className="flex items-center gap-3"
            >
              <img src={item.image} alt={item.name} className="size-12 rounded-lg object-cover" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">{item.name}</p>
                <p className="text-xs text-muted">
                  {item.size ? `Size ${item.size} · ` : ""}Qty {item.qty}
                </p>
              </div>
              <p className="text-sm font-bold text-ink">{formatKes(item.unitPrice * item.qty)}</p>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-stone-100 pt-3">
            <span className="text-base font-bold text-ink">Total</span>
            <span className="text-lg font-extrabold text-primary">{formatKes(total)}</span>
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
            <span className="font-bold text-ink capitalize">{channel}</span>. They'll confirm stock
            and delivery.
          </p>
        </div>

        <Button variant="dark" size="lg" className="w-full" onClick={openPayment}>
          COMPLETE ORDER — PAY NOW
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
          recordOrders(pendingReference, method, channel);
          clearCart();
          navigate("/orders");
        }}
      />
    </MobileShell>
  );
}
