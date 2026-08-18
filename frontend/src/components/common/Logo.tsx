import { cn } from "@/lib/utils";

/* Served from public/ rather than imported from src/assets: it is the same file
   the PWA icon set is generated from (scripts/generate-icons.mjs), and one copy
   that both the build and the icon script read is one fewer thing to keep in
   sync. Precached by the service worker like every other png under public/. */
const logoUrl = "/icons/main_logo.png";

type LogoProps = {
  size?: number;
  className?: string;
};

export function Logo({ size = 36, className }: LogoProps) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-xl object-cover", className)}
      alt="PulseShop"
    />
  );
}
