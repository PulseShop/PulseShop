import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
import { Input } from "@/components/ui/Input";
import { services } from "@/services";
import { useAuth } from "@/stores/auth";
import { useToasts } from "@/stores/toast";
import { AuthShell } from "./AuthShell";

const schema = z
  .object({
    shopName: z.string().min(2, "Give your shop a name"),
    slug: z
      .string()
      .min(3, "At least 3 characters")
      .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(6, "At least 6 characters"),
    city: z.string().min(2, "Where are you based?"),
    whatsapp: z.string().optional().default(""),
    instagram: z.string().optional().default(""),
    facebook: z.string().optional().default(""),
  })
  .superRefine((val, ctx) => {
    const whatsapp = (val.whatsapp ?? "").trim();
    const instagram = (val.instagram ?? "").trim();
    const facebook = (val.facebook ?? "").trim();

    // At least one contact is required so orders have somewhere to land.
    if (!whatsapp && !instagram && !facebook) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["whatsapp"],
        message: "Link at least one — WhatsApp, Instagram or Facebook",
      });
    }
    // WhatsApp is optional, but must be a valid Kenyan number when provided.
    if (whatsapp && !/^(\+?254|0)?[17]\d{8}$/.test(whatsapp)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["whatsapp"],
        message: "Enter a valid Kenyan WhatsApp number",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { shopName: "", slug: "", email: "", password: "", city: "", whatsapp: "" },
  });

  const shopName = watch("shopName");
  const slug = watch("slug");

  // Auto-fill the link from the shop name until the seller edits it themselves.
  useEffect(() => {
    if (!slugEdited) setValue("slug", slugify(shopName));
  }, [shopName, slugEdited, setValue]);

  const onSubmit = handleSubmit(async (data) => {
    try {
      const user = await services.auth.signup({
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
      });
      setSession(user);
      push(`${user.shopName} is live 🎉`, "success");
      navigate("/dashboard/inventory");
    } catch {
      push("Couldn't create your shop. Please try again.", "danger");
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

        <div className="grid grid-cols-2 gap-3">
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

        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />

        <div className="rounded-card border border-white/60 bg-white/50 p-4">
          <p className="text-sm font-bold text-ink">Link your socials</p>
          <p className="mb-3 mt-0.5 text-xs text-muted">
            Orders are routed here. Link at least one — all three are welcome.
          </p>
          <div className="space-y-3">
            <label className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-whatsapp text-white">
                <WhatsAppIcon className="size-4" />
              </span>
              <Input
                aria-label="WhatsApp number"
                placeholder="+254 712 345 678"
                inputMode="tel"
                error={errors.whatsapp?.message}
                {...register("whatsapp")}
              />
            </label>
            <label className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-instagram text-white">
                <InstagramIcon className="size-4" />
              </span>
              <Input aria-label="Instagram handle" placeholder="@yourhandle" {...register("instagram")} />
            </label>
            <label className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-facebook text-white">
                <FacebookIcon className="size-4" />
              </span>
              <Input aria-label="Facebook page" placeholder="yourpage" {...register("facebook")} />
            </label>
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full rounded-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
          Create shop
        </Button>
      </form>
    </AuthShell>
  );
}
