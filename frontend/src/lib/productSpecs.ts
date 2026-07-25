import type { PcSpecs, PhoneSpecs, ProductType } from "@/types";

/**
 * The Phone/PC spec forms, and the bridge between them and the typed specs
 * that get stored.
 *
 * Form state keeps every value as a STRING (even the numeric dropdowns and the
 * free-number fields) for the same reason ProductModal keeps stock/price
 * adjustments as text: a numeric React state forces the intermediate empty
 * string back to 0 mid-keystroke, so a field can't be cleared and retyped.
 * The strings are cast/parsed to the typed PhoneSpecs/PcSpecs once, on submit
 * — the dropdown values all come from the OPTION constants below, so the casts
 * to the literal union types are sound.
 */
export interface PhoneForm {
  brand: string;
  model: string;
  storageGb: string;
  ramGb: string;
  condition: string;
  batteryPct: string;
  networkLock: string;
  carrier: string;
  region: string;
  warrantyMonths: string;
  accessories: string[];
  imeiClean: boolean;
  customNotes: string;
}

export interface PcForm {
  formFactor: string;
  cpu: string;
  cpuTier: string;
  gpu: string;
  gpuTier: string;
  ramGb: string;
  storageGb: string;
  storageType: string;
  psuWatts: string;
  psuRating: string;
  os: string;
  cooling: string;
  displaySizeIn: string;
  displayRefreshHz: string;
  warrantyMonths: string;
  customNotes: string;
}

/** "128 GB" / "1 TB" — the label a buyer expects, from a raw GB number. */
export const capacityLabel = (gb: number) =>
  gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} TB` : `${gb} GB`;

type Opt = { value: string; label: string };
const caps = (gbs: number[]): Opt[] =>
  gbs.map((gb) => ({ value: String(gb), label: capacityLabel(gb) }));

// --- Phone options ----------------------------------------------------------
export const PHONE_STORAGE = caps([128, 256, 512, 1024]);
export const PHONE_RAM = caps([8, 12, 16, 24]);
export const PHONE_CONDITIONS: Opt[] = [
  { value: "new", label: "Brand new / Sealed" },
  { value: "mint", label: "Mint / Like new" },
  { value: "good", label: "Good / Excellent" },
  { value: "fair", label: "Fair / Used" },
  { value: "salvage", label: "Needs service / Degraded" },
];
export const PHONE_NETWORK_LOCK: Opt[] = [
  { value: "unlocked", label: "Unlocked" },
  { value: "locked", label: "Carrier-locked" },
];
export const PHONE_ACCESSORIES: Opt[] = [
  { value: "box", label: "Original box" },
  { value: "charger", label: "Charger" },
  { value: "cable", label: "Cable" },
  { value: "earphones", label: "Earphones" },
];

// --- PC options -------------------------------------------------------------
export const PC_FORM_FACTORS: Opt[] = [
  { value: "desktop", label: "Desktop tower" },
  { value: "sff", label: "Small form factor" },
  { value: "laptop", label: "Laptop" },
  { value: "mini", label: "Mini PC" },
  { value: "aio", label: "All-in-one" },
];
export const PC_CPU_TIERS: Opt[] = [
  { value: "budget", label: "Budget" },
  { value: "mid", label: "Mid-range" },
  { value: "high-end", label: "High-end" },
  { value: "workstation", label: "Workstation" },
];
export const PC_GPU_TIERS: Opt[] = [
  { value: "entry", label: "Entry / Integrated" },
  { value: "mid", label: "Mid-range" },
  { value: "high-end", label: "High-end" },
  { value: "flagship", label: "Flagship" },
];
export const PC_RAM = caps([16, 32, 64, 128]);
export const PC_STORAGE = caps([512, 1024, 2048, 4096]);
export const PC_STORAGE_TYPES: Opt[] = [
  { value: "sata-ssd", label: "SATA SSD" },
  { value: "nvme-pcie4", label: "NVMe PCIe 4.0" },
  { value: "nvme-pcie5", label: "NVMe PCIe 5.0" },
];
export const PC_PSU_RATINGS: Opt[] = [
  { value: "", label: "— not specified —" },
  { value: "bronze", label: "80+ Bronze" },
  { value: "gold", label: "80+ Gold" },
  { value: "platinum", label: "80+ Platinum" },
  { value: "titanium", label: "80+ Titanium" },
];
export const PC_OS: Opt[] = [
  { value: "windows-home", label: "Windows 11 Home" },
  { value: "windows-pro", label: "Windows 11 Pro" },
  { value: "macos", label: "macOS" },
  { value: "linux", label: "Linux" },
  { value: "none", label: "No OS" },
];
export const PC_COOLING: Opt[] = [
  { value: "air", label: "Air" },
  { value: "aio", label: "AIO liquid" },
  { value: "custom-loop", label: "Custom loop" },
];

/** PSU wattage/rating only mean something on a build with an internal ATX PSU. */
export const pcHasPsu = (formFactor: string) =>
  formFactor === "desktop" || formFactor === "sff";
/** A built-in display (and its size/refresh) only applies to these. */
export const pcHasDisplay = (formFactor: string) =>
  formFactor === "laptop" || formFactor === "aio";

export const EMPTY_PHONE: PhoneForm = {
  brand: "",
  model: "",
  storageGb: "256",
  ramGb: "8",
  condition: "good",
  batteryPct: "",
  networkLock: "unlocked",
  carrier: "",
  region: "",
  warrantyMonths: "",
  accessories: [],
  imeiClean: true,
  customNotes: "",
};

export const EMPTY_PC: PcForm = {
  formFactor: "desktop",
  cpu: "",
  cpuTier: "mid",
  gpu: "",
  gpuTier: "mid",
  ramGb: "16",
  storageGb: "1024",
  storageType: "nvme-pcie4",
  psuWatts: "",
  psuRating: "",
  os: "windows-home",
  cooling: "air",
  displaySizeIn: "",
  displayRefreshHz: "",
  warrantyMonths: "",
  customNotes: "",
};

/** Parse a free-number field, clamped to a sane range; blank/NaN -> null. */
function numOrNull(s: string, min: number, max: number): number | null {
  const n = Number(s);
  if (!s.trim() || !Number.isFinite(n)) return null;
  return Math.min(Math.max(Math.round(n), min), max);
}

export function toPhoneSpecs(f: PhoneForm): PhoneSpecs {
  return {
    brand: f.brand.trim(),
    model: f.model.trim(),
    storageGb: Number(f.storageGb) as PhoneSpecs["storageGb"],
    ramGb: Number(f.ramGb) as PhoneSpecs["ramGb"],
    condition: f.condition as PhoneSpecs["condition"],
    batteryPct: numOrNull(f.batteryPct, 0, 100),
    networkLock: f.networkLock as PhoneSpecs["networkLock"],
    // A carrier only means something on a locked phone — drop it otherwise so a
    // seller who flips locked -> unlocked can't leave a stale carrier behind.
    carrier: f.networkLock === "locked" ? f.carrier.trim() || null : null,
    region: f.region.trim() || null,
    warrantyMonths: numOrNull(f.warrantyMonths, 0, 120),
    accessories: f.accessories as PhoneSpecs["accessories"],
    imeiClean: f.imeiClean,
    customNotes: f.customNotes.trim() || null,
  };
}

export function fromPhoneSpecs(s: PhoneSpecs): PhoneForm {
  return {
    brand: s.brand,
    model: s.model,
    storageGb: String(s.storageGb),
    ramGb: String(s.ramGb),
    condition: s.condition,
    batteryPct: s.batteryPct == null ? "" : String(s.batteryPct),
    networkLock: s.networkLock,
    carrier: s.carrier ?? "",
    region: s.region ?? "",
    warrantyMonths: s.warrantyMonths == null ? "" : String(s.warrantyMonths),
    accessories: s.accessories ?? [],
    imeiClean: s.imeiClean,
    customNotes: s.customNotes ?? "",
  };
}

export function toPcSpecs(f: PcForm): PcSpecs {
  const hasPsu = pcHasPsu(f.formFactor);
  const hasDisplay = pcHasDisplay(f.formFactor);
  return {
    formFactor: f.formFactor as PcSpecs["formFactor"],
    cpu: f.cpu.trim(),
    cpuTier: f.cpuTier as PcSpecs["cpuTier"],
    gpu: f.gpu.trim(),
    gpuTier: f.gpuTier as PcSpecs["gpuTier"],
    ramGb: Number(f.ramGb) as PcSpecs["ramGb"],
    storageGb: Number(f.storageGb) as PcSpecs["storageGb"],
    storageType: f.storageType as PcSpecs["storageType"],
    // Fields that don't apply to this form factor are stored null, not left at
    // whatever the seller typed before switching — see toPhoneSpecs.carrier.
    psuWatts: hasPsu ? numOrNull(f.psuWatts, 0, 3000) : null,
    psuRating: hasPsu ? ((f.psuRating || null) as PcSpecs["psuRating"]) : null,
    os: f.os as PcSpecs["os"],
    cooling: f.cooling as PcSpecs["cooling"],
    displaySizeIn: hasDisplay ? numOrNull(f.displaySizeIn, 0, 120) : null,
    displayRefreshHz: hasDisplay ? numOrNull(f.displayRefreshHz, 0, 1000) : null,
    warrantyMonths: numOrNull(f.warrantyMonths, 0, 120),
    customNotes: f.customNotes.trim() || null,
  };
}

export function fromPcSpecs(s: PcSpecs): PcForm {
  return {
    formFactor: s.formFactor,
    cpu: s.cpu,
    cpuTier: s.cpuTier,
    gpu: s.gpu,
    gpuTier: s.gpuTier,
    ramGb: String(s.ramGb),
    storageGb: String(s.storageGb),
    storageType: s.storageType,
    psuWatts: s.psuWatts == null ? "" : String(s.psuWatts),
    psuRating: s.psuRating ?? "",
    os: s.os,
    cooling: s.cooling,
    displaySizeIn: s.displaySizeIn == null ? "" : String(s.displaySizeIn),
    displayRefreshHz: s.displayRefreshHz == null ? "" : String(s.displayRefreshHz),
    warrantyMonths: s.warrantyMonths == null ? "" : String(s.warrantyMonths),
    customNotes: s.customNotes ?? "",
  };
}

/** The one required field per type — the identity the whole listing hangs on.
 * Everything else has a sensible dropdown default, so it can't be left empty. */
export function specError(type: ProductType, phone: PhoneForm, pc: PcForm): string | null {
  if (type === "phone" && !phone.brand.trim()) return "Add the phone's brand.";
  if (type === "pc" && !pc.cpu.trim()) return "Add the processor (CPU).";
  return null;
}

// --- Buyer-facing display ---------------------------------------------------

const labelOf = (opts: Opt[], value: string) =>
  opts.find((o) => o.value === value)?.label ?? value;

/** Human label for a stored phone condition value — used by the storefront
 * condition filter and anywhere a raw condition needs displaying. */
export const conditionLabel = (value: string) => labelOf(PHONE_CONDITIONS, value);

const months = (n: number) => `${n} month${n === 1 ? "" : "s"}`;

/** A rendered spec line. `warn` flags a value the buyer should notice (an
 * unconfirmed IMEI) so the UI can colour it. */
export interface SpecRow {
  label: string;
  value: string;
  warn?: boolean;
}

/** The stored phone spec -> the rows shown on the product page. Null/blank
 * optionals are dropped so the table only shows what the seller filled in. */
export function phoneSpecRows(s: PhoneSpecs): SpecRow[] {
  const rows: SpecRow[] = [];
  const model = [s.brand, s.model].filter(Boolean).join(" ").trim();
  if (model) rows.push({ label: "Model", value: model });
  rows.push({ label: "Storage", value: capacityLabel(s.storageGb) });
  rows.push({ label: "RAM", value: capacityLabel(s.ramGb) });
  rows.push({ label: "Condition", value: labelOf(PHONE_CONDITIONS, s.condition) });
  if (s.batteryPct != null) rows.push({ label: "Battery health", value: `${s.batteryPct}%` });
  rows.push({
    label: "Network",
    value:
      s.networkLock === "locked"
        ? s.carrier
          ? `Carrier-locked (${s.carrier})`
          : "Carrier-locked"
        : "Unlocked",
  });
  if (s.region) rows.push({ label: "Region / variant", value: s.region });
  if (s.warrantyMonths) rows.push({ label: "Warranty left", value: months(s.warrantyMonths) });
  if (s.accessories.length)
    rows.push({
      label: "In the box",
      value: s.accessories.map((a) => labelOf(PHONE_ACCESSORIES, a)).join(", "),
    });
  rows.push({
    label: "IMEI",
    value: s.imeiClean ? "Clean" : "Not confirmed",
    warn: !s.imeiClean,
  });
  return rows;
}

/** The stored PC spec -> the rows shown on the product page. */
export function pcSpecRows(s: PcSpecs): SpecRow[] {
  const rows: SpecRow[] = [];
  rows.push({ label: "Type", value: labelOf(PC_FORM_FACTORS, s.formFactor) });
  if (s.cpu) rows.push({ label: "Processor", value: s.cpu });
  if (s.gpu) rows.push({ label: "Graphics", value: s.gpu });
  rows.push({ label: "RAM", value: capacityLabel(s.ramGb) });
  rows.push({
    label: "Storage",
    value: `${capacityLabel(s.storageGb)} ${labelOf(PC_STORAGE_TYPES, s.storageType)}`,
  });
  if (pcHasPsu(s.formFactor) && (s.psuWatts || s.psuRating)) {
    rows.push({
      label: "Power supply",
      value: [s.psuWatts ? `${s.psuWatts}W` : null, s.psuRating ? labelOf(PC_PSU_RATINGS, s.psuRating) : null]
        .filter(Boolean)
        .join(" · "),
    });
  }
  rows.push({ label: "Cooling", value: labelOf(PC_COOLING, s.cooling) });
  rows.push({ label: "Operating system", value: labelOf(PC_OS, s.os) });
  if (pcHasDisplay(s.formFactor) && (s.displaySizeIn || s.displayRefreshHz)) {
    rows.push({
      label: "Display",
      value: [s.displaySizeIn ? `${s.displaySizeIn}"` : null, s.displayRefreshHz ? `${s.displayRefreshHz}Hz` : null]
        .filter(Boolean)
        .join(" · "),
    });
  }
  if (s.warrantyMonths) rows.push({ label: "Warranty left", value: months(s.warrantyMonths) });
  return rows;
}

/** The escape-hatch free text, whichever spec shape a product carries. */
export function specNotes(phone: PhoneSpecs | null, pc: PcSpecs | null): string | null {
  return phone?.customNotes ?? pc?.customNotes ?? null;
}
