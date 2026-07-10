import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

/** Phone-width shell for all customer routes: constrained column + sticky bottom nav. */
export function MobileShell({
  children,
  nav = true,
  homeTo,
}: {
  children: ReactNode;
  nav?: boolean;
  /** Where the Home tab points — the current shop on a public storefront. */
  homeTo?: string;
}) {
  return (
    <div className="app-surface mx-auto min-h-dvh w-full max-w-[430px]">
      <div className={nav ? "pb-28" : ""}>{children}</div>
      {nav && <BottomNav homeTo={homeTo} />}
    </div>
  );
}
