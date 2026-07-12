import { useCallback, useState } from "react";
import { isCaptchaEnabled } from "@/lib/captcha";

/**
 * Captcha token state for an auth form.
 *
 * A Turnstile token is single-use: once Supabase has verified it, it is spent.
 * So any failed attempt (wrong password, email already taken) must issue a
 * *fresh* challenge, or the retry fails on the captcha rather than on the thing
 * the user actually got wrong — which looks like the form is broken. `reset()`
 * bumps `nonce`, and the page keys the <Captcha> on it to remount the widget.
 *
 * When no site key is configured the captcha is off entirely: `token` stays
 * undefined and `ready` is always true, so the forms work untouched in dev.
 */
export function useCaptcha() {
  const [token, setToken] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);

  const reset = useCallback(() => {
    setToken(undefined);
    setNonce((n) => n + 1);
  }, []);

  return {
    token,
    setToken,
    reset,
    /** Remount key for the widget. */
    nonce,
    /** Whether the form may be submitted yet. */
    ready: !isCaptchaEnabled || Boolean(token),
  };
}
