import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
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
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { PaymentMethod } from "@/types";
import { cartSubtotal, useCart } from "@/stores/cart";
import { useOrderStore } from "@/stores/order";
import { useOrderHistory } from "@/stores/orderHistory";
import { useShop } from "@/stores/shop";
import { useToasts } from "@/stores/toast";
import { PaymentSheet } from "@/routes/order/PaymentSheet";

const customerSchema = z.object({
  name: z.string().min(2, "Enter your full name"),
  phone: z
    .string()
    .regex(/^(\+?254|0)?[17]\d{8}$/, "Enter a valid Kenyan phone number (e.g. +254712345678)"),
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

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: customer,
    mode: "onBlur",
  });

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

  const persistOrder = (
    data: { name: string; phone: string; notes?: string },
    ch: Channel | "direct",
    payment: { method: PaymentMethod; status: "paid" } | null,
  ) =>
    // Record the order in the backend so it shows in the merchant's dashboard.
    // Fire-and-forget: never block the shopper's WhatsApp/payment handoff on it.
    services.orders
      .submitCartOrder({
        shopSlug,
        items: items.map((i) => ({ productId: i.productId, size: i.size, qty: i.qty })),
        customer: { name: data.name, phone: data.phone, notes: data.notes ?? "" },
        channel: ch,
        payment,
      })
      .catch(() => {});

  const sendOrder = handleSubmit((data) => {
    saveCustomer({ name: data.name, phone: data.phone, notes: data.notes ?? "" });
    const url = cartOrderLink(
      merchant,
      items.map((i) => ({ name: i.name, size: i.size, qty: i.qty, unitPrice: i.unitPrice })),
      { name: data.name, phone: data.phone, notes: data.notes ?? "" },
      channel,
    );
    recordOrders(`PS-${Date.now().toString(36).toUpperCase()}`, null, channel);
    persistOrder(data, channel, null);
    window.open(url, "_blank", "noopener");
    clearCart();
    push(
      `Order sent via ${channel === "whatsapp" ? "WhatsApp" : channel === "instagram" ? "Instagram" : "Facebook"}`,
      "success",
    );
    navigate("/orders");
  });

  const openPayment = async () => {
    const valid = await trigger();
    if (!valid) {
      push("Fill in your details first");
      return;
    }
    const data = getValues();
    saveCustomer({ name: data.name, phone: data.phone, notes: data.notes ?? "" });
    setPayOpen(true);
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
        <form className="space-y-3 rounded-card bg-card p-4 shadow-soft" onSubmit={sendOrder}>
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
        </form>

        {/* channel selector + context notice */}
        <div className="space-y-3 rounded-card bg-card p-4 shadow-soft">
          <div className="grid grid-cols-3 gap-2 rounded-btn bg-stone-100 p-1">
            {channels.map(({ id: ch, label, icon: Icon }) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                className={cn(
                  "flex h-10 items-center justify-center gap-1.5 rounded-[10px] text-xs font-bold transition-all",
                  channel === ch ? "bg-card text-ink shadow-soft" : "text-muted",
                )}
              >
                <Icon
                  className={cn(
                    "size-4",
                    ch === "whatsapp" && "text-whatsapp",
                    ch === "instagram" && "text-instagram",
                    ch === "facebook" && "text-facebook",
                  )}
                />
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Your order will be sent to <span className="font-bold text-ink">{merchant.name}</span> via{" "}
            <span className="font-bold text-ink capitalize">{channel}</span>. They'll confirm stock
            and delivery.
          </p>
        </div>

        <Button size="lg" className="w-full" onClick={sendOrder}>
          SEND ORDER <ArrowRight className="size-5" />
        </Button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-stone-200" />
          <span className="text-xs font-semibold text-muted">or pay now</span>
          <div className="h-px flex-1 bg-stone-200" />
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
        merchantWhatsApp={merchant.contacts.whatsapp}
        onPaid={(reference, method) => {
          recordOrders(reference, method, "direct");
          persistOrder(getValues(), "direct", { method, status: "paid" });
          clearCart();
          navigate("/orders");
        }}
      />
    </MobileShell>
  );
}
