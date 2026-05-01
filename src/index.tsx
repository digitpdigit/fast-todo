/* @refresh reload */
import { render } from "solid-js/web";
import "./index.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import TodayPopover from "./components/TodayPopover";

/** Never throw on module load — `__TAURI_INTERNALS__` may appear after first paint. */
function resolveWindowLabel(): string {
  try {
    if (
      typeof window === "undefined" ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ == null
    ) {
      return "main";
    }
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

function mount() {
  const root = document.getElementById("root");
  if (!root) {
    console.error("Missing #root element");
    return;
  }
  try {
    const windowLabel = resolveWindowLabel();
    const Root = () => (windowLabel === "today-popover" ? <TodayPopover /> : <App />);
    render(() => <Root />, root);
  } catch (e) {
    console.error(e);
    root.innerHTML =
      '<p style="padding:1rem;font-family:system-ui">App failed to start. See DevTools console (Ctrl+Shift+I).</p>';
  }
}

/** Defer so Tauri webview has time to inject internals before getCurrentWindow(). */
requestAnimationFrame(mount);
