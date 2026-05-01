import { emit } from "@tauri-apps/api/event";
import type { ThemeMode } from "../types";

let currentMode: ThemeMode = "system";

export function parseThemeMode(raw: string): ThemeMode {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function effectiveIsDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Toggle `dark` class on `<html>` to match mode (including OS when `system`). */
export function applyDomTheme(mode: ThemeMode) {
  currentMode = mode;
  document.documentElement.classList.toggle("dark", effectiveIsDark(mode));
}

/** Re-apply when OS theme changes while in `system` mode. */
export function bindSystemColorSchemeListener(): () => void {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (currentMode === "system") applyDomTheme("system");
  };
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export async function publishTheme(mode: ThemeMode) {
  try {
    if ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ == null) return;
    await emit("theme-changed", { mode });
  } catch (e) {
    console.error(e);
  }
}
