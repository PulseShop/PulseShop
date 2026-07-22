import * as Popover from "@radix-ui/react-popover";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ProductImage } from "@/components/product/ProductImage";
import { ShareMenu } from "@/components/product/ShareMenu";
import { StockAdjuster } from "@/components/product/StockAdjuster";
import { StockBadge } from "@/components/product/StockBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes, hasPriceRange, minVariantPrice } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { Paged, Product } from "@/types";
import { useToasts } from "@/stores/toast";
import { ProductModal } from "./ProductModal";

const PAGE_SIZE = 10;

function daysAgoLabel(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "added today";
  if (days === 1) return "added 1 day ago";
  return `added ${days} days ago`;
}

export function InventoryPage() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "low" | "out">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  /**
   * Search, filter and paging all run server-side (search_products, migration
   * 0022). They used to run in the browser over the merchant's *entire*
   * catalogue, fetched in full on every visit. Note this is not just a
   * performance change: filtering on the client while paging on the server
   * would silently filter only the page you happen to hold.
   */
  const query = { page, pageSize: PAGE_SIZE, search, category, status: statusFilter } as const;
  const productsKey = ["products", query] as const;

  const productsQ = useQuery({
    queryKey: productsKey,
    queryFn: () => services.products.listProducts(query),
    // Keep the current page on screen while the next one loads, instead of
    // collapsing the table to skeletons on every keystroke.
    placeholderData: keepPreviousData,
  });

  // The category list and the stat cards are aggregates over the whole
  // catalogue, so by definition they can't come from a page of rows.
  const facetsQ = useQuery({
    queryKey: ["product-facets"],
    queryFn: () => services.products.getFacets(),
  });

  const pageItems = productsQ.data?.items ?? [];
  const total = productsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);

  const facets = facetsQ.data;
  const stats = {
    total: facets?.total ?? 0,
    inStock: facets?.available ?? 0,
    low: facets?.low ?? 0,
    out: facets?.out ?? 0,
  };
  const categories = ["All", ...(facets?.categories ?? [])];

  /** Product writes change both the current page and the facet aggregates. */
  const refreshProducts = () => {
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["product-facets"] });
  };

  const discountMut = useMutation({
    mutationFn: ({ id, pct }: { id: string; pct: number | null }) =>
      services.products.updateProduct(id, { discountPct: pct }),
    onMutate: async ({ id, pct }) => {
      await qc.cancelQueries({ queryKey: productsKey });
      const prev = qc.getQueryData<Paged<Product>>(productsKey);
      qc.setQueryData<Paged<Product>>(productsKey, (old) =>
        old
          ? { ...old, items: old.items.map((p) => (p.id === id ? { ...p, discountPct: pct } : p)) }
          : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(productsKey, ctx?.prev);
      push("Couldn't update discount", "danger");
    },
    onSettled: refreshProducts,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => services.products.deleteProduct(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: productsKey });
      const prev = qc.getQueryData<Paged<Product>>(productsKey);
      qc.setQueryData<Paged<Product>>(productsKey, (old) =>
        old
          ? { items: old.items.filter((p) => p.id !== id), total: Math.max(0, old.total - 1) }
          : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(productsKey, ctx?.prev);
      push("Couldn't delete product", "danger");
    },
    onSuccess: () => push("Product deleted", "success"),
    onSettled: refreshProducts,
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => services.products.deleteProduct(id))),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: productsKey });
      const prev = qc.getQueryData<Paged<Product>>(productsKey);
      const idSet = new Set(ids);
      qc.setQueryData<Paged<Product>>(productsKey, (old) =>
        old
          ? {
              items: old.items.filter((p) => !idSet.has(p.id)),
              total: Math.max(0, old.total - ids.length),
            }
          : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(productsKey, ctx?.prev);
      push("Couldn't delete the selected products", "danger");
    },
    onSuccess: (_data, ids) => {
      push(`${ids.length} product${ids.length === 1 ? "" : "s"} deleted`, "success");
      setSelected(new Set());
    },
    onSettled: refreshProducts,
  });

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOnPageSelected = pageItems.length > 0 && pageItems.every((p) => selected.has(p.id));

  return (
    <DashboardShell>
      {/* top bar */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-muted">Dashboard / Inventory</p>
          <h1 className="text-2xl font-extrabold text-ink">Product Inventory</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="size-4" /> Add New Product
          </Button>
        </div>
      </div>

      {/* stat cards */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatCard icon={Boxes} label="Total Products" value={stats.total} tone="text-primary bg-primary/10" />
        <StatCard icon={CheckCircle2} label="In Stock" value={stats.inStock} tone="text-success bg-success/10" />
        <StatCard icon={AlertTriangle} label="Low Stock" value={stats.low} tone="text-warning bg-warning/10" />
        <StatCard icon={XCircle} label="Out of Stock" value={stats.out} tone="text-danger bg-danger/10" />
      </div>

      {/* toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, SKU, or category…"
            className="h-10 w-full rounded-btn border border-stone-200 bg-card pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-10 items-center gap-2 rounded-btn border border-stone-200 bg-card px-3.5 text-sm font-semibold",
                statusFilter !== "all" ? "border-primary text-primary" : "text-ink",
              )}
            >
              <Filter className="size-4" /> Filter
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              sideOffset={6}
              align="start"
              className="z-50 w-44 rounded-card border border-stone-100 bg-card p-1.5 shadow-modal animate-modal-in"
            >
              {(["all", "available", "low", "out"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatusFilter(s);
                    setPage(1);
                  }}
                  className={cn(
                    "flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium capitalize hover:bg-stone-50",
                    statusFilter === s ? "text-primary font-bold" : "text-ink",
                  )}
                >
                  {s === "all" ? "All statuses" : s === "available" ? "Available" : s === "low" ? "Low stock" : "Out of stock"}
                </button>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by category"
          className="h-10 rounded-btn border border-stone-200 bg-card px-3 text-sm font-semibold outline-none focus:border-primary"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === "All" ? "All categories" : c}
            </option>
          ))}
        </select>
      </div>

      {/* bulk actions */}
      {selected.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-card border border-primary/20 bg-primary/5 px-4 py-2.5">
          <p className="text-sm font-semibold text-ink">{selected.size} selected</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs font-semibold text-muted hover:text-ink"
            >
              Clear
            </button>
            <Button variant="danger" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="size-4" /> Delete selected
            </Button>
          </div>
        </div>
      )}

      {/* table */}
      <div className="overflow-hidden rounded-card bg-card shadow-soft">
        {productsQ.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-xs font-bold uppercase tracking-wide text-muted">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allOnPageSelected}
                    onChange={() =>
                      setSelected(
                        allOnPageSelected
                          ? new Set([...selected].filter((id) => !pageItems.some((p) => p.id === id)))
                          : new Set([...selected, ...pageItems.map((p) => p.id)]),
                      )
                    }
                    className="size-4 accent-teal-600"
                  />
                </th>
                <th className="px-2 py-3">Product</th>
                <th className="px-2 py-3">SKU</th>
                <th className="px-2 py-3">Category</th>
                <th className="px-2 py-3">Price</th>
                <th className="px-2 py-3">Discount</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3">Stock</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted">
                    No products match your filters.
                  </td>
                </tr>
              )}
              {pageItems.map((p) => (
                <tr key={p.id} className="border-b border-stone-50 transition-colors hover:bg-stone-50/60">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${p.name}`}
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="size-4 accent-teal-600"
                    />
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-3">
                      <ProductImage src={p.images[0]} alt="" className="size-10 rounded-lg object-cover" />
                      <div>
                        <p className="font-semibold text-ink">{p.name}</p>
                        <p className="text-xs text-muted">{daysAgoLabel(p.createdAt)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <span className="rounded-md bg-stone-100 px-2 py-1 font-mono text-xs font-semibold text-ink">
                      {p.sku}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-muted">{p.category}</td>
                  <td className="px-2 py-3">
                    <div>
                      <span className={cn("font-bold", p.discountPct && "text-muted line-through text-xs")}>
                        {formatKes(p.priceKes)}
                      </span>
                      {p.discountPct != null && (
                        <p className="font-bold text-primary">
                          {hasPriceRange(p) ? "from " : ""}
                          {formatKes(minVariantPrice(p))}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <DiscountCell
                      value={p.discountPct}
                      onSave={(pct) => discountMut.mutate({ id: p.id, pct })}
                    />
                  </td>
                  <td className="px-2 py-3">
                    <StockBadge status={p.status} />
                  </td>
                  <td className="px-2 py-3">
                    <StockAdjuster product={p} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <ShareMenu
                        product={p}
                        triggerClassName="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-primary/10 hover:text-primary"
                        iconClassName="size-4"
                      />
                      <button
                        type="button"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => {
                          setEditing(p);
                          setModalOpen(true);
                        }}
                        className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-primary/10 hover:text-primary"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => setDeleting(p)}
                        className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* pagination — `total` is the size of the full filtered result set on
            the server, not of the page currently on screen */}
        {!productsQ.isLoading && total > 0 && (
          <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3">
            <p className="text-xs font-medium text-muted">
              Showing {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, total)} of{" "}
              {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous page"
                disabled={pageSafe <= 1}
                onClick={() => setPage(pageSafe - 1)}
                className="flex size-8 items-center justify-center rounded-lg text-muted disabled:opacity-30 hover:bg-stone-100"
              >
                <ChevronLeft className="size-4" />
              </button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i + 1)}
                  className={cn(
                    "size-8 rounded-lg text-sm font-semibold",
                    pageSafe === i + 1 ? "bg-primary text-white" : "text-muted hover:bg-stone-100",
                  )}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                aria-label="Next page"
                disabled={pageSafe >= totalPages}
                onClick={() => setPage(pageSafe + 1)}
                className="flex size-8 items-center justify-center rounded-lg text-muted disabled:opacity-30 hover:bg-stone-100"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <ProductModal open={modalOpen} onOpenChange={setModalOpen} product={editing} />

      {/* delete confirm */}
      <Modal
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete product?"
        description={deleting ? `"${deleting.name}" (${deleting.sku}) will be permanently removed.` : ""}
        className="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (deleting) deleteMut.mutate(deleting.id);
              setDeleting(null);
            }}
          >
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      </Modal>

      {/* bulk delete confirm */}
      <Modal
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="Delete selected products?"
        description={`${selected.size} product${selected.size === 1 ? "" : "s"} will be permanently removed.`}
        className="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={bulkDeleteMut.isPending}
            onClick={() => {
              bulkDeleteMut.mutate([...selected]);
              setBulkDeleteOpen(false);
            }}
          >
            <Trash2 className="size-4" /> Delete {selected.size}
          </Button>
        </div>
      </Modal>
    </DashboardShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-card bg-card p-5 shadow-soft">
      <div className={cn("flex size-11 items-center justify-center rounded-xl", tone)}>
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-2xl font-extrabold text-ink">{value}</p>
        <p className="text-xs font-semibold text-muted">{label}</p>
      </div>
    </div>
  );
}

function DiscountCell({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (pct: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value?.toString() ?? "");

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setInput(value?.toString() ?? "");
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Edit discount"
          className={cn(
            "rounded-md px-2 py-1 text-sm font-bold transition-colors hover:bg-stone-100",
            value ? "text-favorite" : "text-muted",
          )}
        >
          {value ? `-${value}%` : "—"}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="z-50 w-48 rounded-card border border-stone-100 bg-card p-3 shadow-modal animate-modal-in"
        >
          <p className="mb-2 text-xs font-bold text-ink">Discount %</p>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              max={90}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = Number(input);
                  onSave(n > 0 ? Math.min(n, 90) : null);
                  setOpen(false);
                }
              }}
              placeholder="0"
              className="h-9 w-full rounded-lg border border-stone-200 px-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => {
                const n = Number(input);
                onSave(n > 0 ? Math.min(n, 90) : null);
                setOpen(false);
              }}
              className="rounded-lg bg-primary px-3 text-xs font-bold text-white"
            >
              Set
            </button>
          </div>
          {value != null && (
            <button
              type="button"
              onClick={() => {
                onSave(null);
                setOpen(false);
              }}
              className="mt-2 text-xs font-semibold text-danger"
            >
              Remove discount
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
