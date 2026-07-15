import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, ImagePlus, KeyRound, Loader2, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ProductImage } from "@/components/product/ProductImage";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { CATEGORY_GROUPS, categoryHasSizes, isLegacyCategory } from "@/lib/constants";
import { generateProductKey } from "@/lib/productKey";
import { cn, isUniqueViolation } from "@/lib/utils";
import { services, type ProductInput } from "@/services";
import type { Product } from "@/types";
import { useToasts } from "@/stores/toast";

// The product key isn't here: it's generated, not entered, so there's nothing
// for the user to get wrong and nothing to validate. See lib/productKey.ts.
const schema = z.object({
  name: z.string().min(2, "Name is required"),
  category: z.string().min(1, "Pick a category"),
  priceKes: z.coerce.number().positive("Price must be above 0"),
  discountPct: z.coerce.number().min(0).max(90).nullable(),
  summary: z.string().max(160, "Keep it under 160 characters").default(""),
  description: z.string().default(""),
});

type FormValues = z.infer<typeof schema>;

/** How many fresh keys to try before giving up and surfacing the error. */
const KEY_COLLISION_RETRIES = 4;

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
  const [sizeInput, setSizeInput] = useState("");
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
    defaultValues: { name: "", category: "", priceKes: 0, discountPct: null, summary: "", description: "" },
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
      });
      setImages(product.images);
      setSizes(product.sizes ?? []);
      setStockQty(String(product.stockQty));
      // An existing product keeps the key it was created with — it's already on
      // the buyer's order messages and the merchant's own records.
      setProductKey(product.sku);
    } else {
      reset({ name: "", category: "", priceKes: 0, discountPct: null, summary: "", description: "" });
      setImages([]);
      setSizes([]);
      setStockQty("0");
      setProductKey(generateProductKey());
    }
  }, [open, product, reset]);

  const category = watch("category");

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
          const url = await services.storage.uploadImage(file, "products");
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

  const addSize = () => {
    const v = sizeInput.trim().toUpperCase();
    if (v && !sizes.includes(v)) setSizes((s) => [...s, v]);
    setSizeInput("");
  };

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
      sizes: categoryHasSizes(data.category) && sizes.length ? sizes : null,
      summary: data.summary || null,
      description: data.description ?? "",
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
              placeholder="Key features, materials, what's included…"
              rows={3}
              error={errors.description?.message}
              {...register("description")}
            />
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

          {/* sizes tag input — only meaningful for clothing/footwear categories */}
          {categoryHasSizes(category) && (
            <div className="col-span-2 flex flex-col gap-1.5">
              <label htmlFor="size-input" className="text-sm font-semibold text-ink">
                Sizes
              </label>
              <div className="flex flex-wrap items-center gap-2 rounded-btn border border-stone-200 bg-card p-2">
                {sizes.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"
                  >
                    {s}
                    <button
                      type="button"
                      aria-label={`Remove size ${s}`}
                      onClick={() => setSizes((arr) => arr.filter((x) => x !== s))}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  id="size-input"
                  value={sizeInput}
                  onChange={(e) => setSizeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addSize();
                    }
                  }}
                  onBlur={addSize}
                  placeholder={sizes.length ? "" : "Type a size and press Enter (leave empty for none)"}
                  className="h-8 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted/60"
                />
              </div>
            </div>
          )}

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
