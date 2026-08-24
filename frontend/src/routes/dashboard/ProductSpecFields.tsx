import type { ReactNode } from "react";
import { Cpu, Lock, Smartphone, Sparkles, Tag } from "lucide-react";
import { Link } from "react-router";
import { Input, Textarea } from "@/components/ui/Input";
import { PLAN_LABEL, planNeededFor } from "@/lib/entitlements";
import { cn } from "@/lib/utils";
import type { ProductType } from "@/types";
import {
  type PcForm,
  type PhoneForm,
  PC_COOLING,
  PC_CPU_TIERS,
  PC_FORM_FACTORS,
  PC_GPU_TIERS,
  PC_OS,
  PC_PSU_RATINGS,
  PC_RAM,
  PC_STORAGE,
  PC_STORAGE_TYPES,
  PHONE_ACCESSORIES,
  PHONE_CONDITIONS,
  PHONE_NETWORK_LOCK,
  PHONE_RAM,
  PHONE_STORAGE,
  pcHasDisplay,
  pcHasPsu,
} from "@/lib/productSpecs";

type Opt = { value: string; label: string };

const TYPE_OPTIONS: { value: ProductType; label: string; icon: typeof Tag }[] = [
  { value: "general", label: "General", icon: Tag },
  { value: "phone", label: "Phone", icon: Smartphone },
  { value: "pc", label: "Computer", icon: Cpu },
];

/**
 * The Phone/PC structured-spec form. General products (fashion, homeware, most
 * of the catalogue) select "General" and see nothing here — the structured
 * fields exist only for the two high-variance categories that need clean
 * filtering. Every dropdown is a fixed choice so a buyer's "at least 16GB RAM"
 * filter can group listings; the free-text brand/model/CPU/GPU and the
 * "Anything else" box carry the rest.
 */
export function ProductSpecFields({
  productType,
  onType,
  phone,
  onPhone,
  pc,
  onPc,
  locked = false,
}: {
  productType: ProductType;
  onType: (t: ProductType) => void;
  phone: PhoneForm;
  onPhone: (f: PhoneForm) => void;
  pc: PcForm;
  onPc: (f: PcForm) => void;
  /**
   * The seller's plan doesn't include structured listings, so Phone and
   * Computer are shown but not selectable. Never passed as true for a product
   * that is ALREADY a phone/PC — see the grandfather clause in ProductModal.
   * Locking someone out of editing a listing they've already published is a
   * different, much worse thing than not letting them create a new one.
   */
  locked?: boolean;
}) {
  const setPhone = (patch: Partial<PhoneForm>) => onPhone({ ...phone, ...patch });
  const setPc = (patch: Partial<PcForm>) => onPc({ ...pc, ...patch });
  const requiredPlan = PLAN_LABEL[planNeededFor("structuredListings")];

  return (
    <fieldset className="col-span-2 flex flex-col gap-3 rounded-card border border-line bg-fill-soft/60 p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-ink">
        Listing type
        {locked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
            <Sparkles className="size-3" aria-hidden />
            {requiredPlan}
          </span>
        )}
      </legend>

      {/* type picker */}
      <div className="grid grid-cols-3 gap-2">
        {TYPE_OPTIONS.map(({ value, label, icon: Icon }) => {
          const on = productType === value;
          // General is never gated: it is the default every product already
          // has, and a seller must always be able to save an ordinary listing.
          const gated = locked && value !== "general";
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              disabled={gated}
              aria-describedby={gated ? "listing-type-locked" : undefined}
              title={gated ? `${label} listings are on the ${requiredPlan} plan` : undefined}
              onClick={() => onType(value)}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-btn border-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                gated
                  ? "cursor-not-allowed border-line bg-fill text-muted"
                  : on
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-line bg-card text-ink hover:border-primary/50",
              )}
            >
              {gated ? <Lock className="size-4" aria-hidden /> : <Icon className="size-4" />}
              {label}
            </button>
          );
        })}
      </div>

      {locked ? (
        <p id="listing-type-locked" className="text-xs text-muted">
          Phone and Computer listings add searchable specs, so buyers can filter your catalogue by
          storage, RAM and condition. They're part of the{" "}
          <span className="font-semibold text-ink">{requiredPlan}</span> plan.{" "}
          <Link to="/prices" className="font-semibold text-primary hover:underline">
            See what's included
          </Link>
          .
        </p>
      ) : (
        productType === "general" && (
          <p className="text-xs text-muted">
            Most products are General. Pick Phone or Computer to add searchable specs like storage,
            RAM and condition.
          </p>
        )
      )}

      {productType === "phone" && (
        <div className="grid grid-cols-2 gap-3">
          {/* BRAND IS NOT HERE ANY MORE. PhoneSpecs still carries one; it is
              what the spec sheet on the product page prints beside the model,
              but it is no longer typed here. Products have a brand column of
              their own now (migration 0060), that is the one the shopper's
              filter and the "Shop by brands" wall read, and two editable fields
              both labelled Brand is a contradiction the seller gets to save.
              ProductModal owns the single field and copies its value into
              phoneSpecs.brand on submit. */}
          <TextField
            label="Model"
            placeholder="iPhone 16 Pro, Galaxy S25 Ultra…"
            value={phone.model}
            onChange={(v) => setPhone({ model: v })}
          />
          <SpecSelect
            label="Storage"
            value={phone.storageGb}
            onChange={(v) => setPhone({ storageGb: v })}
            options={PHONE_STORAGE}
          />
          <SpecSelect
            label="RAM"
            value={phone.ramGb}
            onChange={(v) => setPhone({ ramGb: v })}
            options={PHONE_RAM}
          />
          <SpecSelect
            label="Condition"
            value={phone.condition}
            onChange={(v) => setPhone({ condition: v })}
            options={PHONE_CONDITIONS}
          />
          <TextField
            label="Battery health %"
            numeric
            placeholder="e.g. 92"
            value={phone.batteryPct}
            onChange={(v) => setPhone({ batteryPct: v })}
          />
          <SpecSelect
            label="Network"
            value={phone.networkLock}
            onChange={(v) => setPhone({ networkLock: v })}
            options={PHONE_NETWORK_LOCK}
          />
          {phone.networkLock === "locked" && (
            <TextField
              label="Carrier"
              placeholder="e.g. Safaricom, AT&T"
              value={phone.carrier}
              onChange={(v) => setPhone({ carrier: v })}
            />
          )}
          <TextField
            label="Region / variant"
            placeholder="Global, US, EU, JP…"
            value={phone.region}
            onChange={(v) => setPhone({ region: v })}
          />
          <TextField
            label="Warranty left (months)"
            numeric
            placeholder="0"
            value={phone.warrantyMonths}
            onChange={(v) => setPhone({ warrantyMonths: v })}
          />

          <ChipMulti
            label="In the box"
            options={PHONE_ACCESSORIES}
            selected={phone.accessories}
            onToggle={(v) =>
              setPhone({
                accessories: phone.accessories.includes(v)
                  ? phone.accessories.filter((a) => a !== v)
                  : [...phone.accessories, v],
              })
            }
          />

          <label className="col-span-2 flex items-start gap-3 rounded-btn bg-card p-3">
            <input
              type="checkbox"
              checked={phone.imeiClean}
              onChange={(e) => setPhone({ imeiClean: e.target.checked })}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="text-sm">
              <span className="font-semibold text-ink">IMEI is clean</span>
              <span className="block text-xs text-muted">
                Not blacklisted, reported lost/stolen, or blocked. Uncheck if you can't confirm.
              </span>
            </span>
          </label>

          <CustomNotes
            value={phone.customNotes}
            onChange={(v) => setPhone({ customNotes: v })}
          />
        </div>
      )}

      {productType === "pc" && (
        <div className="grid grid-cols-2 gap-3">
          <SpecSelect
            label="Form factor"
            value={pc.formFactor}
            onChange={(v) => setPc({ formFactor: v })}
            options={PC_FORM_FACTORS}
          />
          <SpecSelect
            label="Operating system"
            value={pc.os}
            onChange={(v) => setPc({ os: v })}
            options={PC_OS}
          />
          <TextField
            label="Processor (CPU)"
            placeholder="Ryzen 7 9800X3D, Core Ultra 7…"
            value={pc.cpu}
            onChange={(v) => setPc({ cpu: v })}
          />
          <SpecSelect
            label="CPU tier"
            value={pc.cpuTier}
            onChange={(v) => setPc({ cpuTier: v })}
            options={PC_CPU_TIERS}
          />
          <TextField
            label="Graphics (GPU)"
            placeholder="RTX 5070 Ti, RX 9070 XT…"
            value={pc.gpu}
            onChange={(v) => setPc({ gpu: v })}
          />
          <SpecSelect
            label="GPU tier"
            value={pc.gpuTier}
            onChange={(v) => setPc({ gpuTier: v })}
            options={PC_GPU_TIERS}
          />
          <SpecSelect
            label="RAM"
            value={pc.ramGb}
            onChange={(v) => setPc({ ramGb: v })}
            options={PC_RAM}
          />
          <SpecSelect
            label="Primary storage"
            value={pc.storageGb}
            onChange={(v) => setPc({ storageGb: v })}
            options={PC_STORAGE}
          />
          <SpecSelect
            label="Storage type"
            value={pc.storageType}
            onChange={(v) => setPc({ storageType: v })}
            options={PC_STORAGE_TYPES}
          />
          <SpecSelect
            label="Cooling"
            value={pc.cooling}
            onChange={(v) => setPc({ cooling: v })}
            options={PC_COOLING}
          />
          {pcHasPsu(pc.formFactor) && (
            <>
              <TextField
                label="PSU wattage"
                numeric
                placeholder="e.g. 850"
                value={pc.psuWatts}
                onChange={(v) => setPc({ psuWatts: v })}
              />
              <SpecSelect
                label="PSU rating"
                value={pc.psuRating}
                onChange={(v) => setPc({ psuRating: v })}
                options={PC_PSU_RATINGS}
              />
            </>
          )}
          {pcHasDisplay(pc.formFactor) && (
            <>
              <TextField
                label="Screen size (inches)"
                numeric
                placeholder="e.g. 16"
                value={pc.displaySizeIn}
                onChange={(v) => setPc({ displaySizeIn: v })}
              />
              <TextField
                label="Refresh rate (Hz)"
                numeric
                placeholder="e.g. 165"
                value={pc.displayRefreshHz}
                onChange={(v) => setPc({ displayRefreshHz: v })}
              />
            </>
          )}
          <TextField
            label="Warranty left (months)"
            numeric
            placeholder="0"
            value={pc.warrantyMonths}
            onChange={(v) => setPc({ warrantyMonths: v })}
          />

          <CustomNotes value={pc.customNotes} onChange={(v) => setPc({ customNotes: v })} />
        </div>
      )}
    </fieldset>
  );
}

function SpecSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Opt[];
}) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-btn border border-line bg-card px-3 text-sm text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A stable id from the label so the <label> and input are associated (Input
 * derives its id from `id`/`name`, which these controlled fields don't get from
 * react-hook-form). Labels are unique within a rendered form, and phone/PC
 * never render together, so collisions can't happen. */
const fieldId = (label: string) => "spec-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** A labelled text/number field. `numeric` keeps it a string and strips
 * non-digits — the same "parse once, on submit" approach the stock and
 * price-adjustment inputs use, so a field can be cleared and retyped. */
function TextField({
  label,
  value,
  onChange,
  placeholder,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <Input
      id={fieldId(label)}
      label={label}
      type="text"
      inputMode={numeric ? "numeric" : undefined}
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(numeric ? e.target.value.replace(/\D/g, "") : e.target.value)}
    />
  );
}

function ChipMulti({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Opt[];
  selected: string[];
  onToggle: (value: string) => void;
}): ReactNode {
  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.value)}
              className={cn(
                "flex h-10 items-center rounded-btn border-2 px-3 text-sm font-semibold transition-colors",
                on
                  ? "border-primary bg-primary text-on-accent"
                  : "border-line bg-card text-ink hover:border-primary/50",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The escape hatch: anything the structured fields don't cover — aftermarket
 * cooling, custom cables, repair history, unlisted mods. */
function CustomNotes({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="col-span-2">
      <Textarea
        label="Anything else / custom mods"
        rows={2}
        maxLength={500}
        placeholder="Aftermarket cooling loop, custom cables, unlocked bootloader, repaint, repair history…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-1 text-xs text-muted">Shown on the product page under the specs.</p>
    </div>
  );
}
