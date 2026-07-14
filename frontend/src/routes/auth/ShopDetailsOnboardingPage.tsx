import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowRight, ArrowLeft, Loader2, Check, Image as ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
import { Input } from "@/components/ui/Input";
import { completeMerchantOnboarding, getCurrentUser } from "@/services/api/auth";
import { NO_SOCIALS_MESSAGE, refineShopSocials, shopDetailsFields } from "@/lib/shopDetailsSchema";
import { slugify } from "@/lib/slug";
import { useAuth } from "@/stores/auth";
import { useToasts } from "@/stores/toast";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/common/Logo";

const schema = z.object(shopDetailsFields).superRefine(refineShopSocials);
type FormValues = z.infer<typeof schema>;

const STEPS = [
  { id: 1, title: "Business Profile", desc: "Name, location & bio" },
  { id: 2, title: "Link Socials", desc: "WhatsApp, Instagram & more" },
  { id: 3, title: "Verify & Launch", desc: "Review and go live" },
];

export function ShopDetailsOnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const push = useToasts((s) => s.push);
  const setSession = useAuth((s) => s.setSession);
  
  const [currentStep, setCurrentStep] = useState(1);
  const [slugEdited, setSlugEdited] = useState(false);
  const [checking, setChecking] = useState(true);

  const prefillName = (location.state as { prefillName?: string } | null)?.prefillName ?? "";

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { shopName: prefillName, slug: "", city: "", whatsapp: "", instagram: "", facebook: "" },
  });

  const shopName = watch("shopName");
  const slug = watch("slug");

  // "No socials at all" is a fault of the whole panel, not of the WhatsApp box
  // the zod issue happens to be attached to — so it's shown against the panel,
  // and only a genuinely malformed number reddens the WhatsApp field itself.
  const noSocials = errors.whatsapp?.message === NO_SOCIALS_MESSAGE;
  const whatsappError = noSocials ? undefined : errors.whatsapp?.message;

  /**
   * Any one of the three satisfies the rule, but the issue is filed against
   * `whatsapp` — and react-hook-form only revalidates the field that changed, so
   * without this an Instagram handle typed after a failed Continue would leave
   * the error stranded on WhatsApp with a social sitting filled in below it.
   */
  const recheckSocials = () => {
    if (noSocials) void trigger("whatsapp");
  };

  useEffect(() => {
    if (!slugEdited) setValue("slug", slugify(shopName));
  }, [shopName, slugEdited, setValue]);

  // Auth Check
  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then((user) => {
      if (cancelled) return;
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }
      // Post-0008, an un-onboarded OAuth user has no merchant row and resolves
      // as a shopper; a merchant account means onboarding is already done.
      if (user.accountType === "merchant") {
        setSession(user);
        navigate("/dashboard/inventory", { replace: true });
        return;
      }
      setChecking(false);
    });
    return () => { cancelled = true; };
  }, [navigate, setSession]);

  const nextStep = async () => {
    // Validate current step before moving on
    let fieldsToValidate: (keyof FormValues)[] = [];
    if (currentStep === 1) fieldsToValidate = ["shopName", "slug", "city"];
    if (currentStep === 2) fieldsToValidate = ["whatsapp", "instagram", "facebook"];
    
    const isStepValid = await trigger(fieldsToValidate);
    if (isStepValid) setCurrentStep((p) => Math.min(p + 1, STEPS.length));
  };

  const prevStep = () => setCurrentStep((p) => Math.max(p - 1, 1));

  const onSubmit = handleSubmit(async (data) => {
    try {
      const user = await completeMerchantOnboarding({
        shopName: data.shopName,
        shopSlug: data.slug,
        city: data.city,
        socials: { whatsapp: data.whatsapp ?? "", instagram: data.instagram ?? "", facebook: data.facebook ?? "" },
      });
      setSession(user);
      push(`${user.shopName} is live 🎉`, "success");
      navigate("/dashboard/inventory");
    } catch {
      push("Couldn't set up your shop. Please try again.", "danger");
    }
  });

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-stone-50">
      {/* LEFT SIDEBAR */}
      <div className="flex w-80 flex-col border-r bg-white p-8">
        <div className="mb-10 flex items-center gap-3">
          <Logo size={32} className="rounded-lg" />
          <span className="text-xl font-extrabold text-ink">PulseShop</span>
        </div>

        <h2 className="text-sm font-bold text-ink">Seller Onboarding</h2>
        <p className="mb-6 text-xs text-muted">Step {currentStep} of {STEPS.length}</p>
        
        <div className="h-1 w-full overflow-hidden rounded-full bg-stone-100 mb-8">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${(currentStep / STEPS.length) * 100}%` }} />
        </div>

        <div className="flex-1 space-y-8">
          {STEPS.map((step) => {
            const isActive = currentStep === step.id;
            const isPast = currentStep > step.id;
            return (
              <div key={step.id} className="flex gap-4">
                <div className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                  isActive ? "bg-primary text-white" : isPast ? "bg-primary/20 text-primary" : "bg-stone-100 text-stone-400"
                )}>
                  {isPast ? <Check className="size-4" /> : step.id}
                </div>
                <div>
                  <p className={cn("text-sm font-bold", isActive || isPast ? "text-ink" : "text-stone-400")}>{step.title}</p>
                  <p className={cn("text-xs", isActive || isPast ? "text-muted" : "text-stone-300")}>{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t pt-6">
          <p className="text-xs font-bold text-ink">Need help?</p>
          <p className="text-xs text-muted">Chat with our setup team on <span className="font-bold text-[#25D366]">WhatsApp</span></p>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl flex-1 p-8 pt-12 lg:p-12">
          
          <form id="onboarding-form" onSubmit={onSubmit} className="space-y-8">
            
            {/* STEP 1: PROFILE */}
            {currentStep === 1 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <h1 className="text-2xl font-extrabold text-ink">Set Up Your Store Profile</h1>
                <p className="mt-2 text-sm text-muted mb-8">This is what your customers see when they visit your storefront.</p>
                
                {/* Visual Image Upload Mocks (To be wired to Supabase Storage later) */}
                <div className="mb-8 space-y-4">
                  <div className="flex h-32 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 text-stone-400 transition-colors hover:border-primary/50 hover:bg-primary/5 cursor-pointer">
                    <ImageIcon className="mb-2 size-6" />
                    <span className="text-sm font-bold">Add Cover Photo</span>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <Input label="Store Name" placeholder="Zawadi Styles" error={errors.shopName?.message} {...register("shopName")} />
                  <div className="space-y-1.5">
                    <Input label="Store Handle" placeholder="zawadistyles" error={errors.slug?.message} {...register("slug", { onChange: () => setSlugEdited(true) })} />
                    <p className="text-xs font-medium text-muted">pulseshop.space/<span className="font-bold text-primary">{slug || "yourshop"}</span></p>
                  </div>
                </div>

                <div className="mt-6">
                  <Input label="City / Location" placeholder="Nairobi" error={errors.city?.message} {...register("city")} />
                </div>
              </div>
            )}

            {/* STEP 2: SOCIALS */}
            {currentStep === 2 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <h1 className="text-2xl font-extrabold text-ink">Link Your Socials</h1>
                <p className="mt-2 text-sm text-muted mb-8">Orders are routed here. Link at least one — all three are welcome.</p>

                <div
                  className={cn(
                    "space-y-5 rounded-xl border bg-white p-6 shadow-sm",
                    noSocials ? "border-danger/40 bg-danger/5" : "border-stone-100",
                  )}
                >
                  {noSocials && (
                    <p
                      className="flex items-center gap-1.5 text-sm font-bold text-danger"
                      aria-live="polite"
                    >
                      <AlertCircle className="size-4 shrink-0" aria-hidden />
                      {NO_SOCIALS_MESSAGE}
                    </p>
                  )}
                  <label className="flex items-center gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-whatsapp text-white"><WhatsAppIcon className="size-5" /></span>
                    <div className="flex-1">
                      <Input aria-label="WhatsApp number" placeholder="+254 712 345 678" inputMode="tel" error={whatsappError} {...register("whatsapp")} />
                    </div>
                  </label>

                  <label className="flex items-center gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-instagram text-white"><InstagramIcon className="size-5" /></span>
                    <div className="flex-1">
                      <Input aria-label="Instagram handle" placeholder="@yourhandle" error={errors.instagram?.message} {...register("instagram", { onChange: recheckSocials })} />
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-facebook text-white"><FacebookIcon className="size-5" /></span>
                    <div className="flex-1">
                      <Input aria-label="Facebook page" placeholder="yourpage" error={errors.facebook?.message} {...register("facebook", { onChange: recheckSocials })} />
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* STEP 3: LAUNCH */}
            {currentStep === 3 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 flex flex-col items-center justify-center py-12 text-center">
                <div className="flex size-20 items-center justify-center rounded-full bg-success/10 text-success mb-6">
                  <Check className="size-10" />
                </div>
                <h1 className="text-2xl font-extrabold text-ink">You're ready to go!</h1>
                <p className="mt-3 text-sm text-muted max-w-md">
                  Your store profile is set up. Click launch below to save your settings and enter your new merchant dashboard.
                </p>
              </div>
            )}
          </form>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="sticky bottom-0 border-t bg-white p-4 px-8 flex items-center justify-between shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)]">
          {currentStep > 1 ? (
            <Button variant="outline" type="button" onClick={prevStep} disabled={isSubmitting}>
              <ArrowLeft className="mr-2 size-4" /> Back
            </Button>
          ) : <div />}

          {currentStep < STEPS.length ? (
            <Button type="button" onClick={nextStep}>
              Continue <ArrowRight className="ml-2 size-4" />
            </Button>
          ) : (
            <Button type="submit" form="onboarding-form" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
              Launch Store
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}