// Renders the PulseShop logo SVG to the PWA icon set (192, 512, maskable).
// Paths mirror src/components/common/Logo.tsx so the favicon/PWA icons match the in-app badge.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const cartPath =
  "M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12";
const pulsePath =
  "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2";

const logo = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" rx="${pad ? 0 : 5}" fill="#0D9488"/>
  <g transform="${pad ? "translate(2.4 2.4) scale(0.8)" : ""}">
    <path d="${cartPath}" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="8" cy="21" r="1" fill="#FFFFFF"/>
    <circle cx="19" cy="21" r="1" fill="#FFFFFF"/>
    <g transform="translate(7.7 6.7) scale(0.4)">
      <path d="${pulsePath}" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });

await sharp(Buffer.from(logo(false))).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(Buffer.from(logo(false))).resize(512, 512).png().toFile("public/icons/icon-512.png");
await sharp(Buffer.from(logo(true))).resize(512, 512).png().toFile("public/icons/maskable-512.png");

console.log("icons written to public/icons/");
