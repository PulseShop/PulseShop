import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { authErrorMessage } from "@/lib/authErrors";
import { passwordSchema } from "@/lib/password";
import { services } from "@/services";
import { isSupabaseConfigured, supabase } from "@/services/api/client";
import { useAuth } from "@/stores/auth";
import { useToasts } from "@/stores/toast";
import { AuthShell } from "./AuthShell";

const schema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

/** Have we got a session we can set a password against? */
type LinkState = "checking" | "ready" | "invalid";

/**
 * The other half of "Forgot password?".
 *
 * resetPassword() emails a recovery link; clicking it hands the browser a
 * short-lived session and lands here. This is the page that actually calls
 * updateUser({ password }) — before it existed the link redirected to /login,
 * which has no field for a new password, so the flow dead-ended and the feature
 * never worked end to end.
 *
 * The session arrives in the URL (hash tokens, or ?code= under PKCE) and the
 * client is configured with detectSessionInUrl, so supabase-js consumes it on
 * boot. getSession() awaits that initialisation, which is why we can just ask it
 * rather than racing a PASSWORD_RECOVERY event.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const push = useToasts((s) => s.push);
  const signOut = useAuth((s) => s.signOut);

  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  const password = watch("password");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Mock backend: nothing to verify, just show the form.
      setLinkState("ready");
      return;
    }

    let cancelled = false;

    // An expired or already-used link comes back as error params rather than a
    // session. Supabase puts them on the hash; ?query is the PKCE variant.
    const params = new URLSearchParams(
      window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.search,
    );
    const err = params.get("error_description") ?? params.get("error");
    if (err) {
      setLinkError(err.replace(/\+/g, " "));
      setLinkState("invalid");
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setLinkState(data.session ? "ready" : "invalid");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = handleSubmit(async (data) => {
    try {
      await services.auth.updatePassword(data.password);

      // Drop the recovery session and make them sign in with the new password.
      // It proves the change took, and it means a recovery link left open in a
      // tab (or in someone's inbox history) isn't still holding a live session.
      await services.auth.logout();
      signOut();

      push("Password updated — sign in with your new password", "success");
      navigate("/login");
    } catch (e) {
      push(authErrorMessage(e, "reset"), "danger");
    }
  });

  const loginFooter = (
    <>
      Remembered it?{" "}
      <Link to="/login" className="font-bold text-primary">
        Log in
      </Link>
    </>
  );

  if (linkState === "checking") {
    return (
      <AuthShell title="One moment" subtitle="Checking your reset link…" footer={loginFooter}>
        <div className="flex justify-center py-6">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </AuthShell>
    );
  }

  if (linkState === "invalid") {
    return (
      <AuthShell
        title="This link isn't valid"
        subtitle="Reset links expire quickly and can only be used once."
        footer={loginFooter}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-warning/10">
            <AlertTriangle className="size-7 text-warning" />
          </div>
          <p className="max-w-xs text-sm text-muted">
            {linkError ?? "Request a fresh reset email and use the newest link."}
          </p>
          <Link
            to="/login"
            className="rounded-btn bg-primary px-5 py-2.5 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Request a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose something you haven't used before."
      footer={loginFooter}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {/* onFocus/onBlur bubble in React, so wrapping catches the input's own
            focus without having to merge handlers into register()'s. */}
        <div
          onFocus={() => setPasswordFocused(true)}
          onBlur={() => setPasswordFocused(false)}
        >
          <PasswordInput
            label="New password"
            placeholder="••••••••"
            autoComplete="new-password"
            // The checklist below names every rule that failed.
            error={undefined}
            {...register("password")}
          />
          <PasswordRequirements
            value={password ?? ""}
            show={passwordFocused || Boolean(password)}
            invalid={Boolean(errors.password)}
          />
        </div>

        <PasswordInput
          label="Confirm new password"
          placeholder="••••••••"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register("confirm")}
        />

        <Button type="submit" size="lg" className="w-full rounded-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ArrowRight className="size-5" />
          )}
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
