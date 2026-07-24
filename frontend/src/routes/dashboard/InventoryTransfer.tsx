import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileDown, Mail, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { downloadCsv } from "@/lib/csv";
import {
  EXPORT_DOWNLOAD_LIMIT,
  LIST_SEPARATOR,
  MAX_IMPORT_ROWS,
  PRODUCT_CSV_COLUMNS,
  type ParsedProductCsv,
  exportFilename,
  parseProductCsv,
  productCsvTemplate,
  productsToCsv,
} from "@/lib/productCsv";
import { services } from "@/services";
import { useAuth } from "@/stores/auth";
import { useToasts } from "@/stores/toast";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Bulk CSV import and export for the inventory table.
 *
 * Export is deliberately the WHOLE catalogue and ignores the filters on screen.
 * "Export" on an inventory page means "give me my products", and a file that
 * silently held only the 12 rows matching a half-forgotten status filter is the
 * kind of thing a seller discovers after they have edited and re-uploaded it.
 * The button label says so.
 *
 * Above EXPORT_DOWNLOAD_LIMIT products the file is built server-side and
 * emailed instead of downloaded: see the header comment on the export-products
 * function for why the browser is the wrong place to assemble a large one.
 */
export function InventoryTransfer({ onImported }: { onImported: () => void }) {
  const push = useToasts((s) => s.push);
  const shopSlug = useAuth((s) => s.session?.shopSlug ?? "");

  const [emailOpen, setEmailOpen] = useState(false);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedProductCsv | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * One read does both jobs: `total` decides download-or-email, and for a small
   * catalogue the same response already carries every row, so the common case
   * costs a single request and no second fetch.
   */
  const exportMut = useMutation({
    mutationFn: async () => {
      const page = await services.products.listProducts({
        page: 1,
        pageSize: EXPORT_DOWNLOAD_LIMIT,
      });
      return page;
    },
    onSuccess: (page) => {
      if (page.total > EXPORT_DOWNLOAD_LIMIT) {
        setPendingTotal(page.total);
        setEmailOpen(true);
        return;
      }
      if (page.items.length === 0) {
        push("There is nothing to export yet");
        return;
      }
      downloadCsv(exportFilename(shopSlug), productsToCsv(page.items));
      push(`Exported ${plural(page.items.length, "product")}`, "success");
    },
    onError: () => push("Couldn't build the export", "danger"),
  });

  const emailMut = useMutation({
    mutationFn: () => services.products.emailProductExport(),
    onSuccess: (res) => {
      setEmailOpen(false);
      push(`Sent ${plural(res.count, "product")} to ${res.email}`, "success");
    },
    onError: (e) =>
      push(e instanceof Error ? e.message : "Couldn't send the export", "danger"),
  });

  const importMut = useMutation({
    mutationFn: () => services.products.importProducts(parsed?.rows ?? []),
    onSuccess: ({ created, updated }) => {
      const parts = [];
      if (created > 0) parts.push(`${plural(created, "product")} added`);
      if (updated > 0) parts.push(`${plural(updated, "product")} updated`);
      push(parts.join(", ") || "Nothing to import", "success");
      onImported();
      closeImport();
    },
    onError: (e) => push(e instanceof Error ? e.message : "Import failed", "danger"),
  });

  function closeImport() {
    setImportOpen(false);
    setFileName("");
    setParsed(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function readFile(file: File) {
    setFileName(file.name);
    // Parsing is synchronous and local: nothing is written until the seller has
    // seen the row counts and pressed the import button.
    setParsed(parseProductCsv(await file.text()));
  }

  const ready = parsed?.rows.length ?? 0;
  const failed = parsed?.errors.length ?? 0;

  return (
    <>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="flex h-10 items-center gap-2 rounded-btn border border-stone-200 bg-card px-3.5 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
        >
          <Upload className="size-4" /> Import
        </button>
        <button
          type="button"
          onClick={() => exportMut.mutate()}
          disabled={exportMut.isPending}
          className="flex h-10 items-center gap-2 rounded-btn border border-stone-200 bg-card px-3.5 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <Download className="size-4" />
          {exportMut.isPending ? "Preparing…" : "Export all"}
        </button>
      </div>

      {/* Over the download limit: the file goes to the shop owner's inbox. */}
      <Modal
        open={emailOpen}
        onOpenChange={setEmailOpen}
        title="We'll email this export"
        description={`Your catalogue has ${plural(pendingTotal, "product")}, more than the ${EXPORT_DOWNLOAD_LIMIT} we hand straight to the browser.`}
        className="max-w-md"
      >
        <div className="mb-5 flex gap-3 rounded-card bg-primary/5 p-4">
          <Mail className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-sm text-ink">
            We'll build the full CSV and send it to the email on this shop's account. It
            usually arrives within a minute.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEmailOpen(false)}>
            Cancel
          </Button>
          <Button disabled={emailMut.isPending} onClick={() => emailMut.mutate()}>
            <Mail className="size-4" />
            {emailMut.isPending ? "Sending…" : "Email it to me"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onOpenChange={(o) => (o ? setImportOpen(true) : closeImport())}
        title="Import products from CSV"
        description="Rows are matched on SKU: an existing SKU updates that product, a new one creates it."
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Choose a CSV file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
          }}
        />

        {!parsed ? (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-card border-2 border-dashed border-stone-200 bg-stone-50/60 px-6 py-10 transition-colors hover:border-primary hover:bg-primary/5"
            >
              <Upload className="size-7 text-muted" />
              <span className="text-sm font-bold text-ink">Choose a CSV file</span>
              <span className="text-xs text-muted">Up to {MAX_IMPORT_ROWS} products per file</span>
            </button>
            <FormatGuide />
          </>
        ) : parsed.fatal ? (
          <>
            <div className="flex gap-3 rounded-card bg-danger/5 p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
              <div>
                <p className="text-sm font-bold text-ink">{fileName} can't be read</p>
                <p className="mt-1 text-sm text-muted">{parsed.fatal}</p>
              </div>
            </div>
            <FormatGuide />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={closeImport}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                Choose another file
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-4 rounded-card bg-stone-50 px-4 py-3">
              <p className="truncate text-sm font-semibold text-ink">{fileName}</p>
              <div className="ml-auto flex shrink-0 items-center gap-4 text-sm font-semibold">
                <span className="flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="size-4" /> {ready} ready
                </span>
                {failed > 0 && (
                  <span className="flex items-center gap-1.5 text-danger">
                    <AlertTriangle className="size-4" /> {failed} skipped
                  </span>
                )}
              </div>
            </div>

            {failed > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                  Rows that will be skipped
                </p>
                {/* Every problem on a row is listed at once so the seller fixes
                    the sheet in one pass instead of re-uploading per error. */}
                <ul className="max-h-48 space-y-1.5 overflow-y-auto rounded-card border border-stone-100 p-3">
                  {parsed.errors.map((e) => (
                    <li key={e.row} className="text-xs leading-relaxed text-muted">
                      <span className="font-bold text-ink">
                        Row {e.row}
                        {e.sku ? ` (${e.sku})` : ""}
                      </span>{" "}
                      {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={closeImport}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                Choose another file
              </Button>
              <Button
                disabled={ready === 0 || importMut.isPending}
                onClick={() => importMut.mutate()}
              >
                {importMut.isPending ? "Importing…" : `Import ${plural(ready, "product")}`}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

/** The column contract, shown where the seller is about to need it rather than
 * hidden in a help page. The template is the same encoder the export uses, so
 * what they download here always matches what the parser expects. */
function FormatGuide() {
  return (
    <div className="mt-5 rounded-card border border-stone-100 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Expected columns</p>
        <button
          type="button"
          onClick={() => downloadCsv("pulseshop-import-template.csv", productCsvTemplate())}
          className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
        >
          <FileDown className="size-3.5" /> Download template
        </button>
      </div>
      <p className="font-mono text-xs leading-relaxed text-ink">
        {PRODUCT_CSV_COLUMNS.join(", ")}
      </p>
      <ul className="mt-3 space-y-1 text-xs text-muted">
        <li>
          <strong className="text-ink">sku</strong> is required on every row and decides whether
          the row updates an existing product or creates a new one.
        </li>
        <li>
          <strong className="text-ink">sizes</strong>, <strong className="text-ink">colors</strong>{" "}
          and <strong className="text-ink">images</strong> hold several values separated by{" "}
          <code className="rounded bg-stone-100 px-1 font-mono">{LIST_SEPARATOR}</code>, for
          example <code className="rounded bg-stone-100 px-1 font-mono">SM;M;LG</code>.
        </li>
        <li>
          <strong className="text-ink">category</strong>, sizes and colours must match the options
          in the product form, so the storefront filters keep working.
        </li>
        <li>
          <strong className="text-ink">images</strong> are web addresses starting with http, not
          files. Upload photos through the product form.
        </li>
        <li>
          Columns the file doesn't carry, such as per-size pricing and SEO text, are left as they
          are on products that already exist.
        </li>
      </ul>
    </div>
  );
}
