// Renders the PulseShop logo to the PWA icon set (192, 512, maskable).
// Source mirrors src/components/common/Logo.tsx so the favicon/PWA icons match
// the in-app badge.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

// The square brand mark: teal rounded tile, pulse line, "Shop" wordmark under
// it. Already 1024x1024 and already square, so unlike the old JPEG source there
// is nothing to centre-crop and nothing to guess about framing.
const SRC = "public/icons/main_logo.png";

// The tile's own teal, sampled from the art. Used to fill behind it wherever a
// square icon has to be opaque: the source is a rounded square on transparency,
// so a PNG flattened onto nothing goes black in some Android launchers and in
// Google's favicon renderer.
const TEAL = { r: 15, g: 118, b: 118, alpha: 1 };

mkdirSync("public/icons", { recursive: true });

const opaque = (size) =>
  sharp(SRC).resize(size, size, { fit: "contain", background: TEAL }).flatten({ background: TEAL });

// Standard icons. Full-bleed: the art carries its own rounded tile and platforms
// apply their own corner radius on top.
await opaque(192).png().toFile("public/icons/icon-192.png");
await opaque(512).png().toFile("public/icons/icon-512.png");

// Maskable. Android crops this to a circle or squircle and only the middle ~80%
// is guaranteed to survive, so the art is inset into a teal field rather than
// run to the edge. The padding is the tile's own teal, so the seam that the old
// gradient source needed `extendWith: "copy"` to hide does not exist here.
await sharp(SRC)
  .resize(410, 410, { fit: "contain", background: TEAL })
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: TEAL })
  .flatten({ background: TEAL })
  .png()
  .toFile("public/icons/maskable-512.png");

// Google shows a favicon beside the search result and wants one that is a
// multiple of 48. 192 already qualifies and is what index.html points at, so
// this is the same art at the size Google actually rasterises to, saving it a
// downscale of a 192 that was itself a downscale.
await opaque(48).png().toFile("public/icons/favicon-48.png");

console.log("icons written to public/icons/");

// ---------------------------------------------------------------------------
// The wordmark, recoloured for a dark background.
//
// The supplied lockups all set "Shop" in near-black navy, which is correct on a
// white page and effectively invisible on the dark one the app now has. There is
// no dark-background artwork in the set, so it is derived here rather than
// hand-edited, which keeps it regenerable if the source lockup changes.
//
// Safe to do by rule because the art is two flat colours: the tile is teal
// (~15,118,118) and the type is navy (~15,18,48). Selecting on "green channel is
// dark" separates them cleanly, and the white pulse line inside the tile is
// nowhere near the threshold. Alpha is left untouched, so the type keeps its
// antialiased edges instead of gaining a halo.
// ---------------------------------------------------------------------------
{
  const SRC_MARK = "public/icons/for_nav.png"; // the transparent master
  const { data, info } = await sharp(SRC_MARK)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 90 && data[i + 1] < 90 && data[i + 2] < 140) {
      data[i] = 250;
      data[i + 1] = 250;
      data[i + 2] = 249; // --color-ink in dark, i.e. stone-50
    }
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile("public/icons/wordmark-on-dark.png");
  console.log("wordmark-on-dark.png written");
}
