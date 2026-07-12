/**
 * Maps a Supabase auth failure to a specific, human-readable message.
 *
 * We read `.code` / `.status` / `.message` by duck-typing rather than
 * `instanceof AuthError` — bundlers can break `instanceof` across module
 * boundaries, and the shape is stable across supabase-js versions. Newer
 * versions carry a machine `code` (e.g. "invalid_credentials"); the message
 * regexes are the fallback for older ones.
 *
 * Security note — user enumeration: on LOGIN we intentionally keep "no such
 * email" and "wrong password" indistinguishable ("Incorrect email or
 * password"). Telling them apart would let anyone probe which emails have
 * accounts. Operational failures (rate-limit, unconfirmed email, offline) are
 * surfaced precisely, because they don't reveal account existence and a vague
 * "check your details" only confuses honest users. On SIGNUP we do report
 * "email already exists" — that is a deliberate, standard UX trade-off (the
 * user needs to know to log in instead); tighten it later if enumeration
 * resistance is required there too.
 */
export type AuthContext = "login" | "signup" | "reset";

function authProps(err: unknown): { code?: string; status?: number; message: string } {
  const e = err as { code?: unknown; status?: unknown; message?: unknown };
  return {
    code: typeof e?.code === "string" ? e.code : undefined,
    status: typeof e?.status === "number" ? e.status : undefined,
    message: typeof e?.message === "string" ? e.message : "",
  };
}

/** True for offline / DNS / CORS-style failures where no response came back. */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch throws TypeError("Failed to fetch")
  const { message } = authProps(err);
  return /failed to fetch|network ?error|load failed/i.test(message);
}

export function authErrorMessage(err: unknown, context: AuthContext): string {
  if (isNetworkError(err)) {
    return "Can't reach the server — check your connection and try again.";
  }

  const { code, status, message } = authProps(err);

  // Rate limiting — shared by both flows.
  if (
    status === 429 ||
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit"
  ) {
    return "Too many attempts. Please wait a minute and try again.";
  }

  if (context === "login") {
    if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
      return "Please confirm your email first — check your inbox for the link.";
    }
    if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
      return "Incorrect email or password.";
    }
    return "Couldn't sign you in. Please try again.";
  }

  // Setting a new password from a recovery link.
  if (context === "reset") {
    if (code === "same_password" || /should be different from the old password/i.test(message)) {
      return "That's already your current password — choose a different one.";
    }
    if (
      code === "weak_password" ||
      (/password/i.test(message) && /weak|breach|pwned|compromis|leaked/i.test(message))
    ) {
      return message || "That password is too weak. Please choose a stronger one.";
    }
    // The recovery session expired mid-form (the link has a short TTL), so the
    // update lands unauthenticated. Say so plainly — retrying the form can't fix
    // it; they need a fresh link.
    if (
      status === 401 ||
      code === "session_not_found" ||
      /session|jwt|token/i.test(message)
    ) {
      return "This reset link has expired. Request a new one from the login page.";
    }
    return "Couldn't update your password. Please try again.";
  }

  // signup
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    /already registered|already been registered|already exists/i.test(message)
  ) {
    return "An account with this email already exists. Log in instead.";
  }
  if (
    code === "weak_password" ||
    (/password/i.test(message) && /weak|breach|pwned|compromis|leaked/i.test(message))
  ) {
    // Supabase's own reason (e.g. "found in a data breach") is the clearest
    // thing we can show — pass it through when present.
    return message || "That password is too weak. Please choose a stronger one.";
  }
  if (code === "signup_disabled" || /signups? (are )?(not allowed|disabled)/i.test(message)) {
    return "New sign-ups are temporarily disabled. Please try again later.";
  }
  return "Couldn't create your account. Please try again.";
}
