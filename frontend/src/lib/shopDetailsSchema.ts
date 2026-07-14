import { z } from "zod";
import { isValidPhone } from "@/lib/phone";
import { SLUG_MIN_LENGTH, SLUG_PATTERN } from "@/lib/slug";

/** Shop-profile fields shared by full signup (SignupPage) and the post-Google
 * "set up your shop" onboarding step (ShopDetailsOnboardingPage). */
export const shopDetailsFields = {
  shopName: z.string().min(2, "Give your shop a name"),
  slug: z
    .string()
    .min(SLUG_MIN_LENGTH, `At least ${SLUG_MIN_LENGTH} characters`)
    .regex(SLUG_PATTERN, "Lowercase letters, numbers and dashes only"),
  city: z.string().min(2, "Where are you based?"),
  whatsapp: z.string().optional().default(""),
  instagram: z.string().optional().default(""),
  facebook: z.string().optional().default(""),
};

interface ShopSocialsValue {
  whatsapp?: string;
  instagram?: string;
  facebook?: string;
}

/**
 * Raised when a seller tries to open a shop with no contact channel at all.
 *
 * It lands on the `whatsapp` path because zod issues need a field to attach to,
 * but it isn't *about* WhatsApp — it's about the group. The forms match on this
 * exact string to lift it out of the WhatsApp field and show it against the
 * whole socials panel, so keep the two in step: see SignupPage and
 * ShopDetailsOnboardingPage.
 */
export const NO_SOCIALS_MESSAGE = "Please give at least one social";

/** At least one contact method is required so orders have somewhere to land;
 * WhatsApp, when given, must be a valid phone number (any country). */
export function refineShopSocials(val: ShopSocialsValue, ctx: z.RefinementCtx) {
  const whatsapp = (val.whatsapp ?? "").trim();
  const instagram = (val.instagram ?? "").trim();
  const facebook = (val.facebook ?? "").trim();

  if (!whatsapp && !instagram && !facebook) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["whatsapp"],
      message: NO_SOCIALS_MESSAGE,
    });
  }
  if (whatsapp && !isValidPhone(whatsapp)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["whatsapp"],
      message: "Enter a valid WhatsApp number, with country code (e.g. +254712345678)",
    });
  }
}
