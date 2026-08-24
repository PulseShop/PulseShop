import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

/** What the OS is asking for right now. */
const systemPrefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;

/** The theme actually being painted, once "system" has been resolved. */
export const resolveTheme = (mode: ThemeMode): "light" | "dark" =>
  mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;

/**
 * The status-bar colour of the installed PWA.
 *
 * index.html ships the light one. Without updating it here, an installed app in
 * dark mode draws a teal status bar above a near-black page, which reads as a
 * rendering bug rather than a theme. Values are the two surface colours from
 * tokens.css.
 */
const THEME_COLOR = { light: "#faf9f5", dark: "#141312" } as const;

/**
 * Paint the resolved theme onto the document.
 *
 * `data-theme` is what tokens.css keys its dark block off. `color-scheme` is
 * separate and not decorative: it is what tells the browser to render form
 * controls, scrollbars and the overscroll gutter dark, none of which our CSS
 * variables reach.
 */
export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const theme = resolveTheme(mode);
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[theme]);
}

interface ThemeState {
  /** What the shopper chose. "system" is the default and follows the OS. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

/**
 * Appearance, per device.
 *
 * Deliberately NOT wiped on sign-out, unlike cart and favorites: which theme
 * someone reads in is a property of the device and its owner's eyes, not of the
 * account. Signing out on a shared phone should not flip it back to light.
 */
export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "system",
      setMode: (mode) => {
        applyTheme(mode);
        set({ mode });
      },
    }),
    {
      name: "pulseshop-theme",
      // Re-apply on rehydrate: the pre-paint script in index.html has already
      // set the attribute from raw localStorage, but this keeps the two in step
      // if the stored value is ever migrated or repaired.
      onRehydrateStorage: () => (state) => state && applyTheme(state.mode),
    },
  ),
);

/**
 * Follow the OS while the mode is "system".
 *
 * Called once at startup. The listener stays for the life of the page because
 * the OS can flip at sunset while the app is open, and a storefront that only
 * notices on reload is worse than one that never followed at all.
 */
export function watchSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    if (useTheme.getState().mode === "system") applyTheme("system");
  });
}
