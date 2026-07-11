// Renders the PulseShop logo image to the PWA icon set (192, 512, maskable).
// Source mirrors src/components/common/Logo.tsx so the favicon/PWA icons match the in-app badge.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "src/assets/pulseshoplogo1.jpg";
// Light-teal background sampled from the logo's own edge, so maskable padding blends in.
const BG = { r: 166, g: 207, b: 212 };

mkdirSync("public/icons", { recursive: true });

// Standard icons — the source already carries its own branded background, so full-bleed.
await sharp(SRC).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(SRC).resize(512, 512).png().toFile("public/icons/icon-512.png");

// Maskable — inset the art to ~80% (the safe zone) so circular/rounded masks
// don't clip the cart or the "PulseShop" wordmark.
const inner = await sharp(SRC).resize(410, 410).toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 3, background: BG } })
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile("public/icons/maskable-512.png");

console.log("icons written to public/icons/");
