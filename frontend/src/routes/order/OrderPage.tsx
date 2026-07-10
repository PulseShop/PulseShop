import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Minus, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { z } from "zod";
import { MobileShell } from "@/components/layout/MobileShell";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { discountedPrice, formatKes } from "@/lib/currency";
import { orderLink } from "@/lib/deeplinks";
import { cn } from "@/lib/utils";
import { services } from "@/services";
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

  const { selectedSize, qty, setQty, customer, saveCustomer } = useOrderStore();
  const addOrder = useOrderHistory((s) => s.add);
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

  const merchant = merchantQ.data;

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

  const unitPrice = discountedPrice(product.priceKes, product.discountPct);
  const total = unitPrice * qty;

  const recordOrder = (reference: string, paymentMethod: PaymentMethod | null, ch: Channel | "direct") => {
    addOrder({
      reference,
      productId: product.id,
      productName: product.name,
      image: product.images[0],
      size: selectedSize,
      qty,
      totalKes: total,
      channel: ch,
      paymentMethod,
      placedAt: new Date().toISOString(),
    });
  };

  const persistOrder = (
    data: { name: string; phone: string; notes?: string },
    ch: Channel | "direct",
    payment: { method: PaymentMethod; status: "paid" } | null,
  ) =>
    // Record the order in the backend so it shows in the merchant's dashboard.
    // Fire-and-forget: never block the shopper's WhatsApp/payment handoff on it.
    services.orders
      .submitOrder({
        productId: product.id,
        size: selectedSize,
        qty,
        customer: { name: data.name, phone: data.phone, notes: data.notes ?? "" },
        channel: ch,
        payment,
      })
      .catch(() => {});

  const sendOrder = handleSubmit((data) => {
    saveCustomer({ name: data.name, phone: data.phone, notes: data.notes ?? "" });
    const url = orderLink(
      merchant,
      product,
      { size: selectedSize, qty, name: data.name, phone: data.phone, notes: data.notes ?? "" },
      channel,
    );
    recordOrder(`PS-${Date.now().toString(36).toUpperCase()}`, null, channel);
    persistOrder(data, channel, null);
    window.open(url, "_blank", "noopener");
    push(`Order sent via ${channel === "whatsapp" ? "WhatsApp" : channel === "instagram" ? "Instagram" : "Facebook"}`, "success");
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
        <h1 className="text-base font-extrabold text-ink">Place Order</h1>
      </header>

      <div className="space-y-4 px-4 pb-10 pt-1">
        {/* product summary */}
        <div className="flex gap-3 rounded-card bg-card p-3 shadow-soft">
          <img
            src={product.images[0]}
            alt={product.name}
            className="size-20 rounded-xl object-cover"
          />
          <div className="flex flex-1 flex-col justify-between py-0.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-ink">{product.name}</p>
                <p className="text-xs text-muted">
                  {selectedSize ? `Size ${selectedSize} · ` : ""}Qty {qty}
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
            Your order will be sent to <span className="font-bold text-ink">{merchant.name}</span>{" "}
            via <span className="font-bold text-ink capitalize">{channel}</span>. They'll confirm
            stock and delivery.
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
          recordOrder(reference, method, "direct");
          persistOrder(customer, "direct", { method, status: "paid" });
        }}
      />
    </MobileShell>
  );
}
