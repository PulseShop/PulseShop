import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { Captcha } from "@/components/auth/Captcha";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useCaptcha } from "@/hooks/useCaptcha";
import { authErrorMessage } from "@/lib/authErrors";
import { passwordSchema } from "@/lib/password";
import { services } from "@/services";
import { EmailConfirmationRequiredError } from "@/services/types";
import { useAuth } from "@/stores/auth";
import { useToasts } from "@/stores/toast";
import { AuthShell } from "./AuthShell";
import { GoogleButton } from "./GoogleButton";

const schema = z.object({
  name: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: passwordSchema,
});

type FormValues = z.infer<typeof schema>;

/** Lightweight signup for shoppers — no shop, just follow/favorites identity. */
export function ShopperSignupPage() {
  const navigate = useNavigate();
  const push = useToasts((s) => s.push);
  const setSession = useAuth((s) => s.setSession);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { password: "" } });
  const captcha = useCaptcha();

  const password = watch("password");
  const [passwordFocused, setPasswordFocused] = useState(false);

  const onSubmit = handleSubmit(async (data) => {
    try {
      const user = await services.auth.signupShopper(data, captcha.token);
      setSession(user);
      push("Welcome to PulseShop 🎉", "success");
      navigate("/shops");
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
      title="Create a shopper account"
      subtitle="Follow your favorite shops and keep your orders in one place."
      footer={
        <>
          Selling something?{" "}
          <Link to="/signup" className="font-bold text-primary">
            Create a shop instead
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Your name"
          placeholder="Jane Wanjiku"
          error={errors.name?.message}
          {...register("name")}
        />
        <Input
          label="Email"
          type="email"
          inputMode="email"
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
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
          Create account
        </Button>
        <p className="text-center text-xs text-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-bold text-primary">
            Log in
          </Link>
        </p>
      </form>
      <div className="my-4 flex items-center gap-3 text-xs font-semibold text-muted">
        <div className="h-px flex-1 bg-white/60" />
        or
        <div className="h-px flex-1 bg-white/60" />
      </div>
      <GoogleButton intent="shopper" label="Continue with Google" />
    </AuthShell>
  );
}
