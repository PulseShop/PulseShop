import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { services } from "@/services";
import type { DiscountPreview } from "@/types";

export interface AppliedDiscount {
  code: string;
  preview: DiscountPreview;
}

interface Props {
  merchantId: string;
  items: { productId: string; qty: number }[];
  /** Read at apply-time (checkout passes the phone field for the one-use-per-buyer check). */
  getPhone?: () => string | undefined;
  applied: AppliedDiscount | null;
  onApply: (applied: AppliedDiscount) => void;
  onClear: () => void;
  /**
   * A code remembered from a previous page (cart → checkout). Validated once
   * on mount; if it no longer qualifies it is dropped silently via onClear —
   * an error message about a code the shopper didn't just type is noise.
   */
  initialCode?: string | null;
}

/**
 * "Have a discount code?" entry — one component so the cart and checkout
 * render the identical flow. Validation is advisory (preview_discount_code);
 * place_order re-validates and recomputes the charge server-side, so nothing
 * here is trusted.
 */
export function DiscountCodeSection({
  merchantId,
  items,
  getPhone,
  applied,
  onApply,
  onClear,
  initialCode,
}: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async (rawCode: string, silent: boolean) => {
    const code = rawCode.trim();
    if (!code) return;
    setChecking(true);
    setError(null);
    try {
      const result = await services.discounts.previewCode(
        merchantId,
        code,
        items.map((i) => ({ productId: i.productId, qty: i.qty })),
        getPhone?.(),
      );
      if (result.valid) {
        onApply({ code: code.toUpperCase(), preview: result });
        setOpen(false);
        setInput("");
      } else if (silent) {
        onClear();
      } else {
        setError(result.reason ?? "This code isn't valid for this order.");
      }
    } catch {
      if (!silent) setError("Couldn't check that code — try again.");
    } finally {
      setChecking(false);
    }
  };

  // Re-validate a remembered code exactly once per mount.
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current || applied || !initialCode || !merchantId || items.length === 0) return;
    autoTried.current = true;
    void check(initialCode, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, merchantId, applied, items.length]);

  if (applied?.preview.valid) {
    return (
      <div className="flex items-center justify-between rounded-btn bg-success/5 px-3 py-2">
        <span className="text-sm font-semibold text-success">
          "{applied.code}" applied — {applied.preview.percentOff}% off
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-bold text-muted underline underline-offset-2 hover:text-ink"
        >
          Remove
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-bold text-primary">
        Have a discount code?
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          autoFocus
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void check(input, false))}
          placeholder="Discount code"
          aria-label="Discount code"
          className="h-10 min-w-0 flex-1 rounded-btn border border-stone-200 bg-card px-3 text-sm uppercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={() => void check(input, false)}
          disabled={!input.trim() || checking}
          className="flex items-center gap-1.5 rounded-btn bg-ink px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {checking && <Loader2 className="size-4 animate-spin" />}
          Apply
        </button>
      </div>
      {error && <p className="text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}
