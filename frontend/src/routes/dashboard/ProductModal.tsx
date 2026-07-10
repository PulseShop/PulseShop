import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, ImagePlus, Loader2, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { services, type ProductInput } from "@/services";
import type { Product } from "@/types";
import { useToasts } from "@/stores/toast";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  sku: z.string().min(2, "SKU is required"),
  category: z.string().min(1, "Pick a category"),
  priceKes: z.coerce.number().positive("Price must be above 0"),
  discountPct: z.coerce.number().min(0).max(90).nullable(),
  description: z.string().default(""),
});

type FormValues = z.infer<typeof schema>;

function suggestSku(name: string, category: string) {
  const cat = (category || "GEN").slice(0, 3).toUpperCase();
  const suffix = Math.floor(Math.random() * 900 + 100);
  return name ? `${cat}-${suffix}` : "";
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
  const [stockQty, setStockQty] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  // "DB Synced" indicator: pulses orange ~900ms on every ± tap, then back to green
  const [syncing, setSyncing] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout>>();
  const fileInput = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { name: "", sku: "", category: "", priceKes: 0, discountPct: null, description: "" },
  });

  useEffect(() => {
    if (!open) return;
    if (product) {
      reset({
        name: product.name,
        sku: product.sku,
        category: product.category,
        priceKes: product.priceKes,
        discountPct: product.discountPct,
        description: product.description,
      });
      setImages(product.images);
      setSizes(product.sizes ?? []);
      setStockQty(product.stockQty);
    } else {
      reset({ name: "", sku: "", category: "", priceKes: 0, discountPct: null, description: "" });
      setImages([]);
      setSizes([]);
      setStockQty(0);
    }
    setSyncing(false);
  }, [open, product, reset]);

  const name = watch("name");
  const category = watch("category");
  const sku = watch("sku");

  useEffect(() => {
    if (!product && name && !sku) setValue("sku", suggestSku(name, category));
  }, [name, category, sku, product, setValue]);

  const bumpStock = (delta: number) => {
    setStockQty((q) => Math.max(0, q + delta));
    setSyncing(true);
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => setSyncing(false), 900);
  };

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
      } catch {
        push("Couldn't upload image", "danger");
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
        : services.products.createProduct(input),
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
      sku: data.sku,
      category: data.category,
      priceKes: data.priceKes,
      discountPct: data.discountPct || null,
      stockQty,
      images: images.length ? images : product?.images ?? [],
      sizes: sizes.length ? sizes : null,
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
                <img src={src} alt="" className="size-16 rounded-xl object-cover" />
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
          <Input label="SKU" placeholder="TOP-001" error={errors.sku?.message} {...register("sku")} />
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
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
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

          {/* sizes tag input */}
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

          {/* stock counter + DB sync indicator */}
          <div className="col-span-2 flex items-end justify-between gap-4 rounded-card bg-stone-50 p-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink">Stock quantity</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Decrease stock"
                  onClick={() => bumpStock(-1)}
                  className="flex size-9 items-center justify-center rounded-full bg-card shadow-soft transition-transform active:scale-90"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-12 text-center text-xl font-extrabold text-ink">{stockQty}</span>
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
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors duration-300",
                syncing ? "bg-warning/15 text-warning animate-pulse" : "bg-success/10 text-success",
              )}
            >
              <Database className="size-3.5" />
              {syncing ? "Syncing…" : "DB Synced"}
            </span>
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
