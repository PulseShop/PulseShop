import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "@/components/common/Logo";

/** Centered glass card over the ambient surface — shared by login & signup. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="app-surface flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Link to="/welcome" className="mb-6 flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-primary">
        <Logo size={40} />
        PulseShop
      </Link>
      <div className="glass-strong w-full max-w-md rounded-modal p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      <div className="mt-5 text-sm font-medium text-muted">{footer}</div>
    </div>
  );
}
