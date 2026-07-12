/**
 * Cloudflare Turnstile — bot protection on the auth endpoints.
 *
 * This is the control that actually addresses "only my app should be able to
 * call this". A Supabase REST/Auth endpoint cannot be restricted to an origin:
 * CORS is enforced by the *browser*, so anyone can curl the endpoint directly
 * and never send an Origin header at all, and the anon key is public by design
 * (it ships in the JS bundle). Origin checks are theatre; RLS is the real access
 * boundary, and a CAPTCHA is what stops a script mass-creating accounts or
 * hammering password-reset emails at your quota.
 *
 * Supabase verifies the token server-side (Auth → Attack Protection → CAPTCHA,
 * with the Turnstile *secret* key). The secret never touches the client — only
 * the site key below, which is public by design.
 *
 * With no VITE_TURNSTILE_SITE_KEY set, the widget renders nothing and every
 * auth call passes `undefined` — so local dev and the mock backend keep working
 * with zero configuration. Turning it on is a matter of setting the env var and
 * pasting the secret into the Supabase dashboard.
 */
export const CAPTCHA_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

export const isCaptchaEnabled = Boolean(CAPTCHA_SITE_KEY);

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

/** Loads the Turnstile script once, no matter how many widgets mount. */
export function loadCaptchaScript(): Promise<void> {
  if (!isCaptchaEnabled) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Turnstile failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/** The slice of the Turnstile global we use. */
export interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
      size?: "normal" | "flexible" | "compact";
    },
  ): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
