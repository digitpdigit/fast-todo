/** Keep default in sync with Rust `db::DEFAULT_TASK_COLOR`. */
export const DEFAULT_TASK_HEX = "#2563EB";

export type PresetColorId = "blue" | "green" | "yellow" | "red";

export const PRESET_COLORS: { id: PresetColorId; label: string; hex: string }[] = [
  { id: "blue", label: "Blue", hex: "#2563EB" },
  { id: "green", label: "Green", hex: "#16A34A" },
  { id: "yellow", label: "Yellow", hex: "#CA8A04" },
  { id: "red", label: "Red", hex: "#DC2626" },
];

/** Normalize for comparisons and filter (uppercase #RRGGBB). */
export function normalizeHex(input: string): string {
  const s = input.trim();
  const m = /^#([0-9A-Fa-f]{6})$/.exec(s);
  if (!m) return DEFAULT_TASK_HEX;
  return `#${m[1].toUpperCase()}`;
}

/** Next preset in rotation (blue → green → yellow → red → …). */
export function nextPresetHex(current: string): string {
  const cur = normalizeHex(current);
  const i = PRESET_COLORS.findIndex((p) => normalizeHex(p.hex) === cur);
  const next = (i >= 0 ? i + 1 : 0) % PRESET_COLORS.length;
  return PRESET_COLORS[next]!.hex;
}

export function isValidHexColor(input: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(input.trim());
}
