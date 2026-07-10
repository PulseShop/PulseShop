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
      message: "Link at least one — WhatsApp, Instagram or Facebook",
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
