/**
 * Client-side product-photo normalisation, run before upload so every image in
 * the bucket is already the shape the storefront renders: square, centred on
 * the middle of the frame, and small.
 *
 * - Center-crops to a square (the shop grid and product page both render
 *   square frames with object-cover, so the crop here is what buyers see).
 * - Downscales to at most 1024×1024 — a 4000px phone photo is ~10× the bytes
 *   for zero visible gain in a 400px frame.
 * - Re-encodes to WebP (quality 0.85), falling back to JPEG where the browser
 *   can't encode WebP. Either way the result stays comfortably under the
 *   bucket's 5MB cap.
 */

const TARGET_SIZE = 1024;
const QUALITY = 0.85;

type Drawable = ImageBitmap | HTMLImageElement;

function dimensions(img: Drawable): { width: number; height: number } {
  return img instanceof HTMLImageElement
    ? { width: img.naturalWidth, height: img.naturalHeight }
    : { width: img.width, height: img.height };
}

async function loadImage(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Some browsers reject certain encodings here — fall through to <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Square-crop + downscale + compress a picked product photo.
 *
 * Returns the original file untouched for GIFs (a canvas pass would freeze the
 * animation) and whenever anything in the pipeline fails — a photo the seller
 * can upload beats a perfect one they can't.
 */
export async function processProductImage(file: File): Promise<File> {
  if (file.type === "image/gif") return file;

  try {
    const img = await loadImage(file);
    const { width, height } = dimensions(img);
    if (!width || !height) return file;

    const side = Math.min(width, height);
    const out = Math.min(side, TARGET_SIZE);

    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // Flatten transparency to white now — the JPEG fallback would otherwise
    // pick its own background, and the storefront cards are white anyway.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (width - side) / 2, (height - side) / 2, side, side, 0, 0, out, out);

    // toBlob silently substitutes PNG when it can't encode the requested type
    // (older Safari + WebP) — detect that via blob.type and re-encode as JPEG,
    // which everything supports and which won't balloon a photo the way PNG does.
    let blob = await encode(canvas, "image/webp", QUALITY);
    if (!blob || blob.type !== "image/webp") {
      blob = await encode(canvas, "image/jpeg", QUALITY);
    }
    if (!blob) return file;

    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}
