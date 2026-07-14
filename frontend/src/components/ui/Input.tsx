import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Control pinned inside the field, against its right edge — e.g. the reveal
   * toggle on PasswordInput. The field reserves room for it so text can't run
   * underneath. */
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, trailing, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-semibold text-ink">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "h-11 w-full rounded-btn border border-stone-200 bg-card px-3.5 text-sm text-ink placeholder:text-muted/70 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20",
              error && "border-danger focus:border-danger focus:ring-danger/20",
              trailing && "pr-11",
              className,
            )}
            {...props}
          />
          {trailing && (
            <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>
          )}
        </div>
        {error && <p className="text-xs font-medium text-danger">{error}</p>}
      </div>
    );
  },
);
Input.displayName = "Input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-semibold text-ink">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            "min-h-20 w-full rounded-btn border border-stone-200 bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20",
            error && "border-danger",
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs font-medium text-danger">{error}</p>}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";
