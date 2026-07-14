import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState } from "react";
import { Input, type InputProps } from "./Input";

/**
 * A password field with a reveal toggle.
 *
 * Every field that takes a password gets one — sign-in, sign-up, reset, confirm.
 * A masked field means the only way to catch a typo is to be told, after a
 * submit, that the password was wrong; the eye lets the user check what they
 * actually typed before finding out the hard way.
 *
 * Starts masked and reverts to masked on remount, so a revealed password can't
 * outlive the moment the user asked to see it.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, "type" | "trailing">>(
  (props, ref) => {
    const [visible, setVisible] = useState(false);
    const action = visible ? "Hide password" : "Show password";

    return (
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            // aria-pressed, not a label swap alone: a screen reader should be
            // able to tell that this is a toggle and which way it's currently set.
            aria-pressed={visible}
            aria-label={action}
            title={action}
            className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {visible ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        }
        {...props}
      />
    );
  },
);
PasswordInput.displayName = "PasswordInput";
