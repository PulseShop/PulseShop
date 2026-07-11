import { cn } from "@/lib/utils";
import logoUrl from "@/assets/pulseshoplogo1.jpg";

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
