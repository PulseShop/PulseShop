"""Bulk-process product images and upload them to Supabase Storage.

For each image in an input folder this:
  1. auto-orients (EXIF) and resizes it down to a max dimension,
  2. re-encodes it as an optimized JPEG,
  3. uploads it to the public `media` bucket under
     `<folder>/<merchant>/<uuid>.jpg`,
  4. prints the public URL and writes a CSV mapping (original -> URL).

Usage:
    python image_processor.py --input ./photos --merchant <merchant_uuid>
    python image_processor.py --input ./photos --merchant <uid> \
        --folder products --max-size 1200 --quality 82 --out urls.csv

The CSV of public URLs can then be pasted into a product's images, or fed to a
future bulk product importer.
"""
from __future__ import annotations

import argparse
import csv
import io
import uuid
from pathlib import Path

from PIL import Image, ImageOps

from _client import MEDIA_BUCKET, get_client

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".heic"}


def optimize(path: Path, max_size: int, quality: int) -> bytes:
    """Return optimized JPEG bytes for the image at `path`."""
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)  # respect camera orientation
        im = im.convert("RGB")
        im.thumbnail((max_size, max_size))  # keep aspect ratio, only shrink
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=quality, optimize=True)
        return buf.getvalue()


def main() -> None:
    ap = argparse.ArgumentParser(description="Optimize + upload product images to Supabase Storage.")
    ap.add_argument("--input", required=True, help="Folder of source images.")
    ap.add_argument("--merchant", required=True, help="Merchant (auth user) UUID — groups the files.")
    ap.add_argument("--folder", default="products", help="Top-level folder in the bucket.")
    ap.add_argument("--max-size", type=int, default=1200, help="Max width/height in px.")
    ap.add_argument("--quality", type=int, default=82, help="JPEG quality (1-95).")
    ap.add_argument("--out", default="uploaded_urls.csv", help="CSV to write (original,url).")
    args = ap.parse_args()

    in_dir = Path(args.input)
    if not in_dir.is_dir():
        raise SystemExit(f"Input folder not found: {in_dir}")

    images = sorted(p for p in in_dir.iterdir() if p.suffix.lower() in EXTS)
    if not images:
        raise SystemExit(f"No images found in {in_dir}")

    client = get_client()
    store = client.storage.from_(MEDIA_BUCKET)
    rows: list[tuple[str, str]] = []

    for src in images:
        try:
            data = optimize(src, args.max_size, args.quality)
            key = f"{args.folder}/{args.merchant}/{uuid.uuid4().hex}.jpg"
            store.upload(key, data, {"content-type": "image/jpeg", "upsert": "true"})
            url = store.get_public_url(key)
            rows.append((src.name, url))
            print(f"OK  {src.name}  ->  {url}")
        except Exception as exc:  # noqa: BLE001 - report and keep going
            print(f"ERR {src.name}: {exc}")

    if rows:
        with open(args.out, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["original", "url"])
            w.writerows(rows)
        print(f"\n{len(rows)} uploaded. URLs written to {args.out}")


if __name__ == "__main__":
    main()
