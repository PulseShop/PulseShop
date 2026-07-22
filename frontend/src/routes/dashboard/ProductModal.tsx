import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, ImagePlus, KeyRound, Loader2, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ProductImage } from "@/components/product/ProductImage";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  CATEGORY_GROUPS,
  PRODUCT_COLORS,
  categoryHasSizes,
  colorHex,
  isLegacyCategory,
  sizeOptionsFor,
  sortSizes,
  statusForQty,
} from "@/lib/constants";
import { formatKes } from "@/lib/currency";
import { processProductImage } from "@/lib/imageProcess";
import { generateProductKey } from "@/lib/productKey";
import { slugify } from "@/lib/slug";
import { CharCount, SeoPreviews } from "@/components/seo/SeoPanel";
import { productSeo } from "@/lib/seo";
import { seoProductFrom } from "@/lib/seoFrom";
import { cn, isUniqueViolation } from "@/lib/utils";
import { services, type ProductInput } from "@/services";
import type { Product } from "@/types";
import { useToasts } from "@/stores/toast";
import { useAuth } from "@/stores/auth";

// The product key isn't here: it's generated, not entered, so there's nothing
// for the user to get wrong and nothing to validate. See lib/productKey.ts.
const schema = z.object({
  name: z.string().min(2, "Name is required"),
  category: z.string().min(1, "Pick a category"),
  priceKes: z.coerce.number().positive("Price must be above 0"),
  discountPct: z.coerce.number().min(0).max(90).nullable(),
  summary: z.string().max(160, "Keep it under 160 characters").default(""),
  description: z.string().default(""),
  metaDescription: z.string().max(160, "Keep it under 160 characters").default(""),
  // Validated against the same alphabet as products_slug_fmt in migration 0028.
  // Blank is valid and means "leave the URL alone".
  slug: z
    .string()
    .default("")
    .refine((v) => v === "" || /^[a-z0-9][a-z0-9-]{0,79}$/.test(slugify(v)), "Letters, numbers and dashes"),
});

type FormValues = z.infer<typeof schema>;

/** How many fresh keys to try before giving up and surfacing the error. */
const KEY_COLLISION_RETRIES = 4;

/** Stored adjustments -> the editable text fields. Zero is left BLANK rather
 * than shown as "0": a grid of zeroes reads as work the seller has to do, when
 * in fact "same price as the base" is the answer for almost every option. */
const toAdjText = (map: Record<string, number>): Record<string, string> =>
  Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v ? String(v) : ""]));

/**
 * Text fields -> the stored map, keeping only options still offered and only
 * non-zero values. Everything else is +0 by definition, so storing it would be
 * noise that has to be kept in sync with the size/colour lists forever.
 */
const toAdjMap = (text: Record<string, string>, offered: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const key of offered) {
    const n = Number(text[key]);
    if (Number.isFinite(n) && n !== 0) out[key] = Math.trunc(n);
  }
  return out;
};

/**
 * Create the product, minting a new key if the one we generated is somehow
 * already taken. Keys are random out of ~850 billion, so this practically never
 * fires — but `products` has a unique index on (merchant_id, sku), and without
 * this a one-in-a-billion clash would reach the merchant as "Couldn't save
 * product" on a form they can't fix, because they don't control the key.
 */
async function createWithUniqueKey(
  input: ProductInput,
  onNewKey: (key: string) => void,
): Promise<Product> {
  let candidate = input;

  for (let attempt = 0; ; attempt++) {
    try {
      return await services.products.createProduct(candidate);
    } catch (err) {
      if (attempt >= KEY_COLLISION_RETRIES || !isUniqueViolation(err)) throw err;
      const key = generateProductKey();
      onNewKey(key);
      candidate = { ...candidate, sku: key };
    }
  }
}

export function ProductModal({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null; // null = create
}) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);

  const [images, setImages] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  // Per-option price adjustments, kept as TEXT for the same reason stockQty is:
  // a numeric state forces the intermediate empty string back to 0 mid-keystroke,
  // so "-50" becomes impossible to type. Parsed once, on submit.
  const [sizeAdj, setSizeAdj] = useState<Record<string, string>>({});
  const [colorAdj, setColorAdj] = useState<Record<string, string>>({});
  // Kept as text, not a number: a merchant restocking 240 units types over the
  // field, and a numeric state would force the intermediate empty string back to
  // 0 mid-keystroke. Parsed once, on submit.
  const [stockQty, setStockQty] = useState("0");
  const [productKey, setProductKey] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { name: "", category: "", priceKes: 0, discountPct: null, summary: "", description: "", metaDescription: "", slug: "" },
  });

  useEffect(() => {
    if (!open) return;
    if (product) {
      reset({
        name: product.name,
        category: product.category,
        priceKes: product.priceKes,
        discountPct: product.discountPct,
        summary: product.summary ?? "",
        description: product.description,
        metaDescription: product.metaDescription ?? "",
        slug: product.slug,
      });
      setImages(product.images);
      setSizes(product.sizes ?? []);
      setColors(product.colors ?? []);
      setSizeAdj(toAdjText(product.sizePriceAdj));
      setColorAdj(toAdjText(product.colorPriceAdj));
      setStockQty(String(product.stockQty));
      // An existing product keeps the key it was created with — it's already on
      // the buyer's order messages and the merchant's own records.
      setProductKey(product.sku);
    } else {
      reset({ name: "", category: "", priceKes: 0, discountPct: null, summary: "", description: "", metaDescription: "", slug: "" });
      setImages([]);
      setSizes([]);
      setColors([]);
      setSizeAdj({});
      setColorAdj({});
      setStockQty("0");
      setProductKey(generateProductKey());
    }
  }, [open, product, reset]);

  const category = watch("category");

  // --- Search & sharing -----------------------------------------------------
  const session = useAuth((st) => st.session);
  const shopHandle = session?.shopSlug ?? "";
  const origin = typeof window === "undefined" ? "https://pulseshop.space" : window.location.origin;

  const nameValue = watch("name");
  const summaryValue = watch("summary");
  const metaDescriptionValue = watch("metaDescription");
  const slugValue = watch("slug");
  const priceValue = watch("priceKes");
  const discountValue = watch("discountPct");

  const slugChanged = Boolean(product && slugify(slugValue) && slugify(slugValue) !== product.slug);

  /**
   * Preview built from the UNSAVED form values, through the same builders the
   * server renders with — so this is what a crawler and a WhatsApp preview will
   * actually show, not a mock-up of it.
   */
  const seoPreview = useMemo(() => {
    if (!nameValue?.trim()) return null;
    return productSeo(
      seoProductFrom(
        {
          id: product?.id ?? "",
          name: nameValue,
          slug: slugify(slugValue) || product?.slug || slugify(nameValue) || "item",
          sku: productKey,
          category: category || "",
          priceKes: Number(priceValue) || 0,
          discountPct: discountValue == null ? null : Number(discountValue),
          stockQty: Number(stockQty) || 0,
          status: statusForQty(Number(stockQty) || 0),
          images,
          sizes: sizes.length ? sizes : null,
          colors: colors.length ? colors : null,
          sizePriceAdj: toAdjMap(sizeAdj, sizes),
          colorPriceAdj: toAdjMap(colorAdj, colors),
          rating: 0,
          reviewCount: 0,
          summary: summaryValue || null,
          description: "",
          metaDescription: metaDescriptionValue || null,
          createdAt: new Date().toISOString(),
          shopSlug: shopHandle,
        },
        {
          name: session?.shopName ?? "Your shop",
          handle: shopHandle,
          location: "",
        } as never,
      ),
      origin,
    );
  }, [
    nameValue, summaryValue, metaDescriptionValue, slugValue, priceValue, discountValue,
    category, images, sizes, colors, sizeAdj, colorAdj, productKey, stockQty,
    product, shopHandle, session?.shopName, origin,
  ]);

  /**
   * A product saved under the old taxonomy (e.g. "Tops") needs its <option> to
   * exist *before* reset() assigns the select's value — an uncontrolled select
   * silently falls back to "" when the value has no matching option, which would
   * clear the category of every legacy product the merchant opened. Derived from
   * the prop, not from watch("category"), because the prop is there on the first
   * render and the form state only catches up in the effect above.
   */
  const legacyCategory =
    product && isLegacyCategory(product.category) ? product.category : null;

  const stockNumber = Number(stockQty) || 0;
  const bumpStock = (delta: number) => setStockQty(String(Math.max(0, stockNumber + delta)));

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      const picked = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (!picked.length) return;
      setUploading(true);
      try {
        for (const file of picked) {
          // Square center-crop + downscale before upload, so the stored image
          // is exactly what the storefront's square frames will show.
          const processed = await processProductImage(file);
          const url = await services.storage.uploadImage(processed, "products");
          setImages((imgs) => [...imgs, url]);
        }
      } catch (err) {
        push(err instanceof Error ? err.message : "Couldn't upload image", "danger");
      } finally {
        setUploading(false);
      }
    },
    [push],
  );

  const toggle = (setter: typeof setSizes, list: string[]) => (value: string) =>
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const toggleSize = toggle(setSizes, sizes);
  const toggleColor = toggle(setColors, colors);

  /**
   * The preset for this category, plus any size already on the product that
   * isn't in it. Products predate the preset (free text: "S", "26", "XS") and a
   * merchant also reclassifies things — switching Footwear to Men's Clothing
   * would otherwise silently drop "42" from a listing on the next save. Showing
   * it as one more selected chip lets them decide.
   */
  const sizeOptions = (() => {
    const preset = sizeOptionsFor(category);
    const extras = sizes.filter((s) => !preset.includes(s));
    return [...preset, ...sortSizes(extras)];
  })();

  // Live preview of what the variants actually cost, so the seller sees the
  // consequence of an adjustment in shillings rather than doing base + 350 in
  // their head — including the discount, which applies AFTER the adjustment.
  const basePrice = Number(watch("priceKes")) || 0;
  const discount = Number(watch("discountPct")) || 0;
  const pricedAt = (adj: number) =>
    Math.max(0, Math.round((basePrice + adj) * (1 - discount / 100)));
  const adjOf = (text: Record<string, string>, key: string) => {
    const n = Number(text[key]);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  };

  /** One "+ KES" field beside a selected option. */
  const adjField = (
    key: string,
    text: Record<string, string>,
    setText: (fn: (t: Record<string, string>) => Record<string, string>) => void,
  ) => (
    <label
      key={key}
      className="flex items-center justify-between gap-3 rounded-btn bg-card px-3 py-2"
    >
      <span className="text-sm font-semibold text-ink">{key}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted">KES</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`Price adjustment for ${key}`}
          value={text[key] ?? ""}
          // Digits and a leading minus only — a seller can discount a size as
          // well as surcharge it, but "12e4" is not a price.
          onChange={(e) =>
            setText((t) => ({ ...t, [key]: e.target.value.replace(/(?!^-)[^\d]/g, "") }))
          }
          placeholder="0"
          className="h-9 w-24 rounded-btn border border-stone-200 bg-card px-2 text-right text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <span className="w-24 text-right text-xs font-bold text-primary">
          = {formatKes(pricedAt(adjOf(text, key)))}
        </span>
      </span>
    </label>
  );

  const mutation = useMutation({
    mutationFn: (input: ProductInput) =>
      product
        ? services.products.updateProduct(product.id, input)
        : createWithUniqueKey(input, setProductKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      push("Product saved", "success");
      onOpenChange(false);
    },
    onError: () => push("Couldn't save product", "danger"),
  });

  const onSubmit = handleSubmit((data) => {
    mutation.mutate({
      name: data.name,
      sku: productKey,
      category: data.category,
      priceKes: data.priceKes,
      discountPct: data.discountPct || null,
      stockQty: stockNumber,
      images,
      sizes: categoryHasSizes(data.category) && sizes.length ? sortSizes(sizes) : null,
      colors: colors.length ? colors : null,
      // Pruned to the options actually offered: an adjustment left behind by a
      // size the seller has since unselected would come back to life — and
      // silently reprice the product — the moment they reselected it.
      sizePriceAdj: toAdjMap(sizeAdj, categoryHasSizes(data.category) ? sizes : []),
      colorPriceAdj: toAdjMap(colorAdj, colors),
      summary: data.summary || null,
      description: data.description ?? "",
      metaDescription: data.metaDescription || null,
      // Only sent when the seller actually changed it. Sending the unchanged
      // value would be harmless today, but the column is the product's public
      // URL and "we only write it when asked" is the property worth keeping.
      ...(product && slugify(data.slug) && slugify(data.slug) !== product.slug
        ? { slug: slugify(data.slug) }
        : {}),
    });
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={product ? "Edit Product" : "Add New Product"}
      description={product ? `Editing ${product.sku}` : "Fill in the details below"}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {/* dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInput.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed p-6 text-center transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-stone-200 hover:border-primary/50",
          )}
        >
          {uploading ? (
            <Loader2 className="size-7 animate-spin text-primary" />
          ) : (
            <ImagePlus className="size-7 text-muted" />
          )}
          <p className="text-sm font-semibold text-ink">
            {uploading ? (
              "Uploading…"
            ) : (
              <>
                Drag & drop images, or <span className="text-primary">browse</span>
              </>
            )}
          </p>
          <p className="text-xs text-muted">PNG or JPG</p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((src, i) => (
              <div key={i} className="relative">
                <ProductImage src={src} alt="" className="size-16 rounded-xl object-cover" />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => setImages((imgs) => imgs.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-ink text-white"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* form grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="Product Name" placeholder="Classic White Tee" error={errors.name?.message} {...register("name")} />
          </div>
          <div className="col-span-2">
            <Input
              label="Short summary"
              placeholder="e.g. Thinnest iPhone ever, A19 Pro chip, all-day battery"
              error={errors.summary?.message}
              {...register("summary")}
            />
          </div>
          <div className="col-span-2">
            <Textarea
              label="Product Details"
              placeholder={
                "Write one detail per line, e.g.\n" +
                "Material: 100% cotton\n" +
                "Fits true to size\n" +
                "Machine washable\n" +
                "Includes: free sticker pack"
              }
              rows={5}
              error={errors.description?.message}
              {...register("description")}
            />
            <p className="mt-1 text-xs text-muted">
              Each line becomes a bullet point on your product page.
            </p>
          </div>
          {/* Product key — generated, never typed. Read-only rather than
              disabled so it stays selectable (and copyable) and is still read
              out by a screen reader. */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="product-key" className="text-sm font-semibold text-ink">
              Product key
            </label>
            <div className="relative">
              <KeyRound
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                id="product-key"
                value={productKey}
                readOnly
                aria-describedby="product-key-hint"
                className="h-11 w-full cursor-default rounded-btn border border-stone-200 bg-stone-50 pl-9 pr-3.5 font-mono text-sm font-bold tracking-widest text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <p id="product-key-hint" className="text-xs text-muted">
              Generated automatically — unique to this product.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="category" className="text-sm font-semibold text-ink">
              Category
            </label>
            <select
              id="category"
              className="h-11 rounded-btn border border-stone-200 bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              {...register("category")}
            >
              <option value="">Select…</option>
              {legacyCategory && (
                <optgroup label="Current">
                  <option value={legacyCategory}>{legacyCategory}</option>
                </optgroup>
              )}
              {CATEGORY_GROUPS.map(({ group, items }) => (
                <optgroup key={group} label={group}>
                  {items.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {errors.category && (
              <p className="text-xs font-medium text-danger">{errors.category.message}</p>
            )}
          </div>
          <Input
            label="Price (KES)"
            type="number"
            min={0}
            placeholder="1200"
            error={errors.priceKes?.message}
            {...register("priceKes")}
          />
          <Input
            label="Discount %"
            type="number"
            min={0}
            max={90}
            placeholder="0"
            error={errors.discountPct?.message}
            {...register("discountPct")}
          />

          {/* Sizes — a fixed preset per category, not free text. Typed sizes
              ("L" / "l" / "Large") can't be aggregated, which is what made the
              buyer's size filter impossible before. Only shown for categories
              where a size means something. */}
          {categoryHasSizes(category) && (
            <fieldset className="col-span-2 flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-semibold text-ink">
                Available sizes{" "}
                <span className="font-medium text-muted">— tap the ones you stock</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {sizeOptions.map((s) => {
                  const on = sizes.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleSize(s)}
                      className={cn(
                        "flex h-10 min-w-12 items-center justify-center rounded-btn border-2 px-3 text-sm font-semibold transition-colors",
                        on
                          ? "border-primary bg-primary text-white"
                          : "border-stone-200 bg-card text-ink hover:border-primary/50",
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted">
                {sizes.length
                  ? "Buyers must pick one of these before they can order."
                  : "Leave all unselected if this product has no sizes."}
              </p>

              {/* Price per size — only for the sizes actually selected, so the
                  form grows with the seller's choices instead of showing a
                  wall of fields for options they don't stock. */}
              {sizes.length > 0 && (
                <div className="mt-2 space-y-1 rounded-card bg-stone-50 p-3">
                  <p className="text-xs font-semibold text-ink">
                    Price by size{" "}
                    <span className="font-medium text-muted">
                      — leave blank for the same price
                    </span>
                  </p>
                  {sortSizes(sizes).map((s) => adjField(s, sizeAdj, setSizeAdj))}
                </div>
              )}
            </fieldset>
          )}

          {/* Colours — offered for every category: a phone case, a mug and a
              jacket all come in colours. Optional, like sizes. */}
          <fieldset className="col-span-2 flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-semibold text-ink">
              Available colours{" "}
              <span className="font-medium text-muted">— tap the ones you stock</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_COLORS.map(({ name }) => {
                const on = colors.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleColor(name)}
                    className={cn(
                      "flex h-10 items-center gap-2 rounded-btn border-2 pl-2 pr-3 text-sm font-semibold transition-colors",
                      on
                        ? "border-primary bg-primary text-white"
                        : "border-stone-200 bg-card text-ink hover:border-primary/50",
                    )}
                  >
                    <span
                      aria-hidden
                      style={{ backgroundColor: colorHex(name) }}
                      className="size-5 shrink-0 rounded-full ring-1 ring-inset ring-black/15"
                    />
                    {name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted">
              {colors.length
                ? "Buyers must pick one of these before they can order."
                : "Leave all unselected if this product only comes one way."}
            </p>

            {colors.length > 0 && (
              <div className="mt-2 space-y-1 rounded-card bg-stone-50 p-3">
                <p className="text-xs font-semibold text-ink">
                  Price by colour{" "}
                  <span className="font-medium text-muted">
                    — leave blank for the same price
                  </span>
                </p>
                {colors.map((c) => adjField(c, colorAdj, setColorAdj))}
                <p className="pt-1 text-xs text-muted">
                  Size and colour adjustments add together — an XL in a colour at
                  +100 costs the base price plus both.
                </p>
              </div>
            )}
          </fieldset>

          {/* stock counter + DB sync indicator. The +/- buttons are for nudging a
              number that's nearly right; the field between them is typeable, so
              stocking 240 units doesn't mean 240 clicks. */}
          <div className="col-span-2 flex items-end justify-between gap-4 rounded-card bg-stone-50 p-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="stock-qty" className="text-sm font-semibold text-ink">
                Stock quantity
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Decrease stock"
                  onClick={() => bumpStock(-1)}
                  disabled={stockNumber === 0}
                  className="flex size-9 items-center justify-center rounded-full bg-card shadow-soft transition-transform active:scale-90 disabled:pointer-events-none disabled:opacity-40"
                >
                  <Minus className="size-4" />
                </button>
                <input
                  id="stock-qty"
                  // text + inputMode, not type="number": this keeps the mobile
                  // numeric keypad but hands us the raw string, so the digit
                  // filter below actually sees (and can reject) a stray "-" or
                  // "e" instead of type="number" silently reporting "".
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value.replace(/\D/g, ""))}
                  // Emptying the field is a legitimate way to retype it; it just
                  // can't be left that way.
                  onBlur={() => setStockQty(String(stockNumber))}
                  className="h-11 w-24 rounded-btn border border-stone-200 bg-card text-center text-xl font-extrabold text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  aria-label="Increase stock"
                  onClick={() => bumpStock(1)}
                  className="flex size-9 items-center justify-center rounded-full bg-card shadow-soft transition-transform active:scale-90"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
            {mutation.isPending && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1.5 text-xs font-bold text-warning">
                <Database className="size-3.5 animate-pulse" />
                Saving…
              </span>
            )}
          </div>
        </div>

        {/*
          Search & sharing. Collapsed by default and last in the form: it is
          genuinely optional — every field here has a sensible generated default
          — and putting an optional section in front of the required ones is how
          you get sellers abandoning the "add product" flow.
        */}
        <details className="rounded-btn border border-stone-200 bg-stone-50/60 p-4">
          <summary className="cursor-pointer select-none text-sm font-bold text-ink">
            Search &amp; sharing
            <span className="ml-2 font-medium text-muted">optional</span>
          </summary>

          <p className="mt-2 text-xs text-muted">
            How this product looks in Google and when a customer shares its link. Leave blank and
            we write it from the summary and price.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <Textarea
                label="Search description"
                rows={2}
                maxLength={160}
                placeholder="What it is, who it suits, and why yours."
                error={errors.metaDescription?.message}
                {...register("metaDescription")}
              />
              <div className="mt-1 flex justify-end">
                <CharCount value={metaDescriptionValue} ideal={70} max={160} />
              </div>
            </div>

            {product && (
              <div>
                <Input
                  label="Link"
                  error={errors.slug?.message}
                  {...register("slug")}
                />
                <p className="mt-1 text-xs text-muted">
                  {origin}/{shopHandle || "your-shop"}/
                  <span className="font-semibold text-ink">{slugify(slugValue) || product.slug}</span>
                </p>
                {slugChanged && (
                  <p className="mt-1.5 rounded-btn bg-warning/15 px-3 py-2 text-xs font-semibold text-warning">
                    Changing the link breaks every existing link to this product — anything already
                    shared on WhatsApp, and its place in Google. Only do this if the current link is
                    wrong.
                  </p>
                )}
              </div>
            )}

            {seoPreview && <SeoPreviews seo={seoPreview} />}
          </div>
        </details>

        <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Save Product
          </Button>
        </div>
      </form>
    </Modal>
  );
}
