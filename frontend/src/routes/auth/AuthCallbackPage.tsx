import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { getCurrentUser } from "@/services/api/auth";
import { supabase } from "@/services/api/client";
import { useAuth } from "@/stores/auth";
import { useToasts } from "@/stores/toast";

/**
 * Landing page for the Google OAuth redirect. The Supabase client
 * (detectSessionInUrl: true) exchanges the redirect's tokens for a session
 * asynchronously, so we wait for onAuthStateChange rather than assuming a
 * session is already present on mount.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setSession = useAuth((s) => s.setSession);
  const push = useToasts((s) => s.push);

  useEffect(() => {
    let settled = false;
    const intent = searchParams.get("intent");

    const finish = async () => {
      if (settled) return;
      settled = true;

      const user = await getCurrentUser();
      if (!user) {
        push("Couldn't sign you in with Google. Please try again.", "danger");
        navigate("/login", { replace: true });
        return;
      }

      if (intent === "merchant" && user.accountType !== "merchant") {
        const { data } = await supabase.auth.getUser();
        const meta = data.user?.user_metadata as Record<string, unknown> | undefined;
        const prefillName =
          (meta?.full_name as string | undefined) ?? (meta?.name as string | undefined) ?? "";
        navigate("/signup/shop-details", { replace: true, state: { prefillName } });
        return;
      }

      setSession(user);
      if (user.accountType === "merchant") {
        push(`Welcome back to ${user.shopName}`, "success");
        navigate("/dashboard/inventory", { replace: true });
      } else {
        push("Welcome to PulseShop 🎉", "success");
        // Same destination as the password form — see LoginPage.
        navigate("/", { replace: true });
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void finish();
    });

    // Session may already have been exchanged before this listener attached.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void finish();
    });

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      push("Google sign-in timed out. Please try again.", "danger");
      navigate("/login", { replace: true });
    }, 8000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate, push, searchParams, setSession]);

  return (
    <div className="app-surface flex min-h-dvh flex-col items-center justify-center gap-3 px-5">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm font-medium text-muted">Signing you in…</p>
    </div>
  );
}
