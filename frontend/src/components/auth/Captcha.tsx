import { useEffect, useRef } from "react";
import { CAPTCHA_SITE_KEY, isCaptchaEnabled, loadCaptchaScript } from "@/lib/captcha";

/**
 * The Turnstile challenge, mounted on the auth forms.
 *
 * Renders nothing at all when VITE_TURNSTILE_SITE_KEY is unset, so the forms
 * behave exactly as before in local dev / mock mode. The token it produces is
 * passed to Supabase Auth, which verifies it server-side — the client is not
 * trusted to decide whether the challenge passed.
 */
export function Captcha({
  onToken,
  onExpire,
}: {
  onToken: (token: string) => void;
  onExpire?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  // Held in refs so the mount effect doesn't re-run (and re-render the widget)
  // every time a parent re-renders with fresh callback identities.
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!isCaptchaEnabled) return;

    let widgetId: string | undefined;
    let cancelled = false;

    loadCaptchaScript()
      .then(() => {
        if (cancelled || !boxRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(boxRef.current, {
          sitekey: CAPTCHA_SITE_KEY,
          size: "flexible",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onExpireRef.current?.(),
          "error-callback": () => onExpireRef.current?.(),
        });
      })
      .catch(() => {
        // Script blocked (offline, ad-blocker). Leave the token unset — the form
        // will report the failure on submit rather than silently signing in.
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  if (!isCaptchaEnabled) return null;

  return <div ref={boxRef} className="flex justify-center" />;
}
