import { ClipboardPaste, Images, SquarePlus, Sticker } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Shared with both the in-flow tutorial modal (ShareMenu) and the static
 * dashboard walkthrough card — one source of truth for the 4 manual steps
 * Instagram still requires (Meta blocks apps from placing the link sticker).
 */
export const INSTAGRAM_STORY_STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: SquarePlus,
    title: "Start a new Story",
    body: "Open Instagram and tap the + to create a new Story.",
  },
  {
    icon: Images,
    title: "Add the downloaded photo",
    body: "Pick the image PulseShop just saved to your camera roll.",
  },
  {
    icon: Sticker,
    title: "Add the Link sticker",
    body: "Tap the sticker icon in the top bar, then choose Link.",
  },
  {
    icon: ClipboardPaste,
    title: "Paste your link & share",
    body: "Your product link is already copied — just paste it in and post.",
  },
];
