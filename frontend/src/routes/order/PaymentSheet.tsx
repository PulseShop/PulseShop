import { Check, CreditCard, Loader2, Phone, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { FacebookIcon, InstagramIcon, PayPalIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Modal";
import { formatKes } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { useToasts } from "@/stores/toast";
import type { PaymentMethod } from "@/types";

type Stage =
  | { step: "choose" }
  | { step: "mpesa-phone" }
  | { step: "pending"; method: PaymentMethod }
  | { step: "paypal-approve" }
  | { step: "card-approve" }
  | { step: "success"; method: PaymentMethod }
  | { step: "failed"; method: PaymentMethod };

type NotifyChannel = "whatsapp" | "instagram" | "facebook";
type Notify = { channel: NotifyChannel; label: string; url: string; message: string };

const CHANNEL_ICON: Record<NotifyChannel, typeof WhatsAppIcon> = {
  whatsapp: WhatsAppIcon,
  instagram: InstagramIcon,
  facebook: FacebookIcon,
};

export function PaymentSheet({
  open,
  onOpenChange,
  amount,
  defaultPhone,
  merchantName,
  orderReference,
  notify = null,
  onPaid,
  defaultMethod = "mpesa",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  defaultPhone: string;
  merchantName: string;
  /** The order this payment is for — already created (pending) before the sheet opens. */
  orderReference: string;
  /** Seller notification to fire the moment payment succeeds — built from the
   * channel the buyer picked in checkout (whichever the seller has set up). */
  /**
   * The seller handoff message, for the legacy single-shop flow. Optional
   * because the pickup-station flow (0062) has no handoff: the order goes to
   * the warehouse, not into a WhatsApp thread. Every use below already guards
   * on it being absent.
   */
  notify?: Notify | null;
  onPaid: (method: PaymentMethod) => void;
  /** Method the buyer already picked on the checkout page. The sheet still
   * shows its own toggle — this only decides which one starts selected, so
   * nobody is asked the same question twice. */
  defaultMethod?: PaymentMethod;
}) {
  const push = useToasts((s) => s.push);
  const [stage, setStage] = useState<Stage>({ step: "choose" });
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
  const [phone, setPhone] = useState(defaultPhone);

  // prefill with the customer's phone from the order form each time the sheet opens
  useEffect(() => {
    if (open && defaultPhone) setPhone(defaultPhone);
  }, [open, defaultPhone]);

  // Re-sync when the sheet reopens: the buyer may have changed the method on
  // the checkout page between attempts.
  useEffect(() => {
    if (open) setMethod(defaultMethod);
  }, [open, defaultMethod]);

  const reset = (next: boolean) => {
    onOpenChange(next);
    if (!next) setStage({ step: "choose" });
  };

  // Fired once payment succeeds — opens (or copies, for IG/FB) the seller
  // notification. `win` is a tab opened synchronously inside the triggering
  // click, before the payment await, so the browser doesn't block it as a
  // popup once we redirect it here.
  const dispatchNotify = async (win: Window | null) => {
    if (!notify) return;
    if (notify.channel !== "whatsapp") {
      await navigator.clipboard?.writeText(notify.message).catch(() => {});
      push(`Order details copied — paste them into the ${notify.label} chat`, "success");
    } else {
      push(`Order sent to the seller via ${notify.label}`, "success");
    }
    if (win) win.location.href = notify.url;
    else window.open(notify.url, "_blank", "noopener");
  };

  const startMpesa = async () => {
    const win = notify ? window.open("", "_blank", "noopener") : null;
    setStage({ step: "pending", method: "mpesa" });
    try {
      const result = await services.payments.payWithMpesa(phone, amount);
      if (result.status === "paid") {
        setStage({ step: "success", method: "mpesa" });
        onPaid("mpesa");
        await dispatchNotify(win);
      } else {
        win?.close();
        setStage({ step: "failed", method: "mpesa" });
      }
    } catch {
      win?.close();
      setStage({ step: "failed", method: "mpesa" });
    }
  };

  const startPaypal = async () => {
    const win = notify ? window.open("", "_blank", "noopener") : null;
    setStage({ step: "pending", method: "paypal" });
    try {
      const result = await services.payments.payWithPaypal(amount);
      if (result.status === "paid") {
        setStage({ step: "success", method: "paypal" });
        onPaid("paypal");
        await dispatchNotify(win);
      } else {
        win?.close();
        setStage({ step: "failed", method: "paypal" });
      }
    } catch {
      win?.close();
      setStage({ step: "failed", method: "paypal" });
    }
  };

  const startCard = async () => {
    const win = notify ? window.open("", "_blank", "noopener") : null;
    setStage({ step: "pending", method: "card" });
    try {
      const result = await services.payments.payWithCard(amount);
      if (result.status === "paid") {
        setStage({ step: "success", method: "card" });
        onPaid("card");
        await dispatchNotify(win);
      } else {
        win?.close();
        setStage({ step: "failed", method: "card" });
      }
    } catch {
      win?.close();
      setStage({ step: "failed", method: "card" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={reset} title="Complete Payment">
      {stage.step === "choose" && (
        <div className="space-y-4">
          <p className="text-center text-2xl font-extrabold text-ink">{formatKes(amount)}</p>

          {/* method toggle */}
          <div className="grid grid-cols-3 gap-2 rounded-btn bg-fill p-1">
            {(["mpesa", "paypal", "card"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  "flex h-11 items-center justify-center gap-2 rounded-[10px] text-sm font-bold transition-all",
                  method === m ? "bg-card text-ink shadow-soft" : "text-muted",
                )}
              >
                {m === "mpesa" ? (
                  <>
                    <Phone className="size-4 text-success" /> M-Pesa
                  </>
                ) : m === "paypal" ? (
                  <>
                    <PayPalIcon className="size-4 text-facebook" /> PayPal
                  </>
                ) : (
                  <>
                    <CreditCard className="size-4 text-primary" /> Card
                  </>
                )}
              </button>
            ))}
          </div>

          {method === "mpesa" ? (
            <div className="space-y-3">
              <Input
                label="M-Pesa phone number"
                placeholder="+254 712 345 678"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Button
                size="lg"
                className="w-full"
                disabled={phone.replace(/\D/g, "").length < 9}
                onClick={startMpesa}
              >
                Send STK Prompt
              </Button>
            </div>
          ) : method === "paypal" ? (
            <div className="space-y-3">
              <p className="text-center text-sm text-muted">
                You'll be redirected to PayPal to approve this payment.
              </p>
              <button
                type="button"
                onClick={() => setStage({ step: "paypal-approve" })}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-btn bg-[#FFC439] text-sm font-extrabold text-[#003087] transition-transform active:scale-[0.98]"
              >
                <PayPalIcon className="size-5" />
                Pay with PayPal
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-sm text-muted">
                You'll continue to a secure card checkout. Your card details never pass through
                PulseShop.
              </p>
              <button
                type="button"
                onClick={() => setStage({ step: "card-approve" })}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-btn bg-primary text-sm font-extrabold text-on-accent transition-transform active:scale-[0.98]"
              >
                <CreditCard className="size-5" />
                Pay with card
              </button>
            </div>
          )}
        </div>
      )}

      {stage.step === "paypal-approve" && (
        <div className="space-y-4 text-center">
          <div className="rounded-card border border-line bg-fill-soft p-5">
            <PayPalIcon className="mx-auto size-8 text-[#003087]" />
            <p className="mt-3 text-sm font-semibold text-ink">
              Approve payment of {formatKes(amount)} to {merchantName}?
            </p>
            <p className="mt-1 text-xs text-muted">PayPal sandbox — mock approval</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStage({ step: "choose" })}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={startPaypal}>
              Approve
            </Button>
          </div>
        </div>
      )}

      {stage.step === "card-approve" && (
        <div className="space-y-4 text-center">
          <div className="rounded-card border border-line bg-fill-soft p-5">
            <CreditCard className="mx-auto size-8 text-primary" />
            <p className="mt-3 text-sm font-semibold text-ink">
              Continue with card payment of {formatKes(amount)} to {merchantName}?
            </p>
            <p className="mt-1 text-xs text-muted">Secure gateway handoff</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStage({ step: "choose" })}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={startCard}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {stage.step === "pending" && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <Loader2 className="size-10 animate-spin text-primary" />
          <div>
            <p className="font-bold text-ink">
              {stage.method === "mpesa"
                ? "Check your phone"
                : stage.method === "paypal"
                  ? "Talking to PayPal…"
                  : "Opening secure card checkout…"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {stage.method === "mpesa"
                ? "Enter your M-Pesa PIN on the STK prompt to complete payment."
                : stage.method === "paypal"
                  ? "Confirming your payment…"
                  : "Confirming your card payment…"}
            </p>
          </div>
        </div>
      )}

      {stage.step === "success" && (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-success/10 animate-check-pop">
            <Check className="size-8 text-success" strokeWidth={3} />
          </div>
          <div>
            <p className="text-lg font-extrabold text-ink">Payment successful!</p>
            <p className="mt-1 text-sm text-muted">
              Order reference:{" "}
              <span className="font-mono font-bold text-ink">{orderReference}</span>
            </p>
          </div>
          {notify && (
            <button
              type="button"
              onClick={() => dispatchNotify(null)}
              className={cn(
                "inline-flex items-center gap-2 text-sm font-bold",
                notify.channel === "whatsapp" && "text-whatsapp",
                notify.channel === "instagram" && "text-instagram",
                notify.channel === "facebook" && "text-facebook",
              )}
            >
              {(() => {
                const Icon = CHANNEL_ICON[notify.channel];
                return <Icon className="size-4" />;
              })()}
              Didn't open? Message the seller via {notify.label}
            </button>
          )}
          <Button variant="dark" className="w-full" onClick={() => reset(false)}>
            Done
          </Button>
        </div>
      )}

      {stage.step === "failed" && (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-danger/10">
            <RotateCcw className="size-7 text-danger" />
          </div>
          <p className="font-bold text-ink">Payment failed</p>
          <Button
            className="w-full"
            onClick={() => {
              if (stage.method === "mpesa") setStage({ step: "mpesa-phone" });
              else if (stage.method === "paypal") startPaypal();
              else setStage({ step: "card-approve" });
            }}
          >
            Try again
          </Button>
        </div>
      )}

      {stage.step === "mpesa-phone" && (
        <div className="space-y-3">
          <Input
            label="M-Pesa phone number"
            placeholder="+254 712 345 678"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button size="lg" className="w-full" onClick={startMpesa}>
            Retry payment
          </Button>
        </div>
      )}
    </Sheet>
  );
}
