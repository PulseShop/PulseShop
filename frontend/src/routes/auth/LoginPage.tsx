import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShoppingBag, Store } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { Captcha } from "@/components/auth/Captcha";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCaptcha } from "@/hooks/useCaptcha";
import { authErrorMessage } from "@/lib/authErrors";
import { services } from "@/services";
import { useAuth } from "@/stores/auth";
import { useToasts } from "@/stores/toast";
import { AuthShell } from "./AuthShell";
import { GoogleButton } from "./GoogleButton";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const push = useToasts((s) => s.push);
  const setSession = useAuth((s) => s.setSession);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const [resetting, setResetting] = useState(false);
  // Which button was pressed — drives the per-button spinner. The account's
  // real type still governs where we land; a mismatch just gets a short note.
  const [pendingRole, setPendingRole] = useState<"shopper" | "merchant" | null>(null);
  const captcha = useCaptcha();

  const onForgotPassword = async () => {
    const email = getValues("email")?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      push("Enter your email above first");
      return;
    }
    setResetting(true);
    try {
      await services.auth.resetPassword(email, captcha.token);
      push("Check your inbox for a password reset link", "success");
    } catch {
      push("Couldn't send the reset email — try again", "danger");
    } finally {
      // The token is spent either way — a retry needs a fresh challenge.
      captcha.reset();
      setResetting(false);
    }
  };

  // Both buttons share this. `intended` is the role the user pressed; the
  // account's actual type wins for routing (a shopper can't reach the seller
  // dashboard — RequireMerchant would bounce them anyway), and we explain the
  // difference when the two don't match instead of silently redirecting.
  const submitAs = (intended: "shopper" | "merchant") =>
    handleSubmit(async (data) => {
      setPendingRole(intended);
      try {
        const user = await services.auth.login(data, captcha.token);
        setSession(user);
        if (user.accountType === "merchant") {
          push(
            intended === "shopper"
              ? `That's a seller account — taking you to ${user.shopName}`
              : `Welcome back to ${user.shopName}`,
            "success",
          );
          navigate("/dashboard/inventory");
        } else {
          push(
            intended === "merchant"
              ? "That's a shopper account — taking you to your shops"
              : "Welcome back",
            "success",
          );
          navigate("/shops");
        }
      } catch (err) {
        push(authErrorMessage(err, "login"), "danger");
        // Spent token — the retry needs a fresh challenge, or it would fail on
        // the captcha instead of on the password the user actually got wrong.
        captcha.reset();
      } finally {
        setPendingRole(null);
      }
    });

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in as a buyer or a seller."
      footer={
        <>
          New to PulseShop?{" "}
          <Link to="/signup/shopper" className="font-bold text-primary">
            Sign up to shop
          </Link>{" "}
          ·{" "}
          <Link to="/signup" className="font-bold text-primary">
            Create a shop
          </Link>
        </>
      }
    >
      {/* Enter in a field submits as buyer (the broader audience); the two
          explicit buttons cover both roles. */}
      <form onSubmit={submitAs("shopper")} className="space-y-4">
        <Input
          label="Email"
          type="email"
          inputMode="email"
          placeholder="you@shop.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <div className="space-y-1.5">
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <div className="text-right">
            <button
              type="button"
              onClick={onForgotPassword}
              disabled={resetting}
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-60"
            >
              {resetting ? "Sending…" : "Forgot password?"}
            </button>
          </div>
        </div>
        <Captcha
          key={captcha.nonce}
          onToken={captcha.setToken}
          onExpire={() => captcha.setToken(undefined)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Button
            type="submit"
            variant="outline"
            size="lg"
            className="rounded-full px-2 text-sm"
            disabled={isSubmitting || !captcha.ready}
          >
            {pendingRole === "shopper" ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ShoppingBag className="size-4" />
            )}
            Sign in as Buyer
          </Button>
          <Button
            type="button"
            size="lg"
            className="rounded-full px-2 text-sm"
            onClick={submitAs("merchant")}
            disabled={isSubmitting || !captcha.ready}
          >
            {pendingRole === "merchant" ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Store className="size-4" />
            )}
            Sign in as Seller
          </Button>
        </div>
      </form>
      <div className="my-4 flex items-center gap-3 text-xs font-semibold text-muted">
        <div className="h-px flex-1 bg-white/60" />
        or
        <div className="h-px flex-1 bg-white/60" />
      </div>
      <GoogleButton intent="login" label="Continue with Google" />
    </AuthShell>
  );
}
