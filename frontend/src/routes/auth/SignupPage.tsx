import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { Captcha } from "@/components/auth/Captcha";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { useCaptcha } from "@/hooks/useCaptcha";
import { passwordSchema } from "@/lib/password";
import { Button } from "@/components/ui/Button";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { services } from "@/services";
import { EmailConfirmationRequiredError } from "@/services/types";
import { authErrorMessage } from "@/lib/authErrors";
import { NO_SOCIALS_MESSAGE, refineShopSocials, shopDetailsFields } from "@/lib/shopDetailsSchema";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useToasts } from "@/stores/toast";
import { AuthShell } from "./AuthShell";
import { GoogleButton } from "./GoogleButton";

const schema = z
  .object({
    ...shopDetailsFields,
    email: z.string().email("Enter a valid email"),
    password: passwordSchema,
  })
  .superRefine(refineShopSocials);

type FormValues = z.infer<typeof schema>;

export function SignupPage() {
  const navigate = useNavigate();
  const push = useToasts((s) => s.push);
  const setSession = useAuth((s) => s.setSession);
  const [slugEdited, setSlugEdited] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { shopName: "", slug: "", email: "", password: "", city: "", whatsapp: "" },
  });

  const captcha = useCaptcha();

  const shopName = watch("shopName");
  const slug = watch("slug");
  const password = watch("password");
  const [passwordFocused, setPasswordFocused] = useState(false);

  // "No socials at all" is a fault of the whole panel, not of the WhatsApp box
  // it happens to be attached to — so it's shown against the panel, and only a
  // genuinely malformed number reddens the WhatsApp field itself.
  const noSocials = errors.whatsapp?.message === NO_SOCIALS_MESSAGE;
  const whatsappError = noSocials ? undefined : errors.whatsapp?.message;

  /**
   * Any one of the three socials satisfies the rule, but the issue is filed
   * against `whatsapp` — and react-hook-form only revalidates the field that
   * actually changed. Typing an Instagram handle would otherwise leave the error
   * stranded on WhatsApp until the next submit, telling the seller they've given
   * no socials while one sits filled in right below it.
   */
  const recheckSocials = () => {
    if (noSocials) void trigger("whatsapp");
  };

  // Auto-fill the link from the shop name until the seller edits it themselves.
  useEffect(() => {
    if (!slugEdited) setValue("slug", slugify(shopName));
  }, [shopName, slugEdited, setValue]);

  const onSubmit = handleSubmit(async (data) => {
    try {
      const user = await services.auth.signup(
        {
          shopName: data.shopName,
          shopSlug: data.slug,
          email: data.email,
          password: data.password,
          city: data.city,
          socials: {
            whatsapp: data.whatsapp,
            instagram: data.instagram ?? "",
            facebook: data.facebook ?? "",
          },
        },
        captcha.token,
      );
      setSession(user);
      push(`${user.shopName} is live 🎉`, "success");
      navigate("/dashboard/inventory");
    } catch (err) {
      if (err instanceof EmailConfirmationRequiredError) {
        push("Check your email to confirm your account, then log in", "success");
        navigate("/login");
        return;
      }
      push(authErrorMessage(err, "signup"), "danger");
      // The captcha token is single-use — reissue for the retry.
      captcha.reset();
    }
  });

  return (
    <AuthShell
      title="Create your shop"
      subtitle="Set up your storefront and connect the apps you sell on."
      footer={
        <>
          Already have a shop?{" "}
          <Link to="/login" className="font-bold text-primary">
            Log in
          </Link>
          <br />
          Just here to shop?{" "}
          <Link to="/signup/shopper" className="font-bold text-primary">
            Create a shopper account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Shop name"
          placeholder="Zawadi Styles"
          error={errors.shopName?.message}
          {...register("shopName")}
        />

        <div className="space-y-1.5">
          <Input
            label="Your shop link"
            placeholder="zawadistyles"
            error={errors.slug?.message}
            {...register("slug", { onChange: () => setSlugEdited(true) })}
          />
          <p className="text-xs font-medium text-muted">
            pulseshop.space/<span className="font-bold text-primary">{slug || "yourshop"}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <Input
            label="City"
            placeholder="Nairobi"
            error={errors.city?.message}
            {...register("city")}
          />
          <Input
            label="Email"
            type="email"
            inputMode="email"
            placeholder="you@shop.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register("email")}
          />
        </div>

        {/* onFocus/onBlur bubble in React, so wrapping catches the input's own
            focus without having to merge handlers into register()'s. */}
        <div
          onFocus={() => setPasswordFocused(true)}
          onBlur={() => setPasswordFocused(false)}
        >
          <PasswordInput
            label="Password"
            placeholder="••••••••"
            autoComplete="new-password"
            // The checklist below names every rule that failed; repeating the
            // first one as a red error underneath is just noise.
            error={undefined}
            {...register("password")}
          />
          <PasswordRequirements
            value={password ?? ""}
            show={passwordFocused || Boolean(password)}
            invalid={Boolean(errors.password)}
          />
        </div>

        <div
          className={cn(
            "rounded-card border p-4",
            noSocials ? "border-danger/40 bg-danger/5" : "border-white/60 bg-white/50",
          )}
        >
          <p className="text-sm font-bold text-ink">Link your socials</p>
          <p className="mb-3 mt-0.5 text-xs text-muted">
            Orders are routed here. Link at least one — all three are welcome.
          </p>
          {noSocials && (
            <p
              className="mb-3 flex items-center gap-1.5 text-xs font-bold text-danger"
              aria-live="polite"
            >
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              {NO_SOCIALS_MESSAGE}
            </p>
          )}
          <div className="space-y-3">
            <label className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-whatsapp text-white">
                <WhatsAppIcon className="size-4" />
              </span>
              <Input
                aria-label="WhatsApp number"
                placeholder="+254 712 345 678"
                inputMode="tel"
                error={whatsappError}
                {...register("whatsapp")}
              />
            </label>
            <label className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-instagram text-white">
                <InstagramIcon className="size-4" />
              </span>
              <Input
                aria-label="Instagram handle"
                placeholder="@yourhandle"
                {...register("instagram", { onChange: recheckSocials })}
              />
            </label>
            <label className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-facebook text-white">
                <FacebookIcon className="size-4" />
              </span>
              <Input
                aria-label="Facebook page"
                placeholder="yourpage"
                {...register("facebook", { onChange: recheckSocials })}
              />
            </label>
          </div>
        </div>

        <Captcha
          key={captcha.nonce}
          onToken={captcha.setToken}
          onExpire={() => captcha.setToken(undefined)}
        />
        <Button
          type="submit"
          size="lg"
          className="w-full rounded-full"
          disabled={isSubmitting || !captcha.ready}
        >
          {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
          Create shop
        </Button>
      </form>
      <div className="my-4 flex items-center gap-3 text-xs font-semibold text-muted">
        <div className="h-px flex-1 bg-white/60" />
        or
        <div className="h-px flex-1 bg-white/60" />
      </div>
      <GoogleButton intent="merchant" label="Continue with Google" />
    </AuthShell>
  );
}
