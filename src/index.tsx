/* @refresh reload */
import { render } from "solid-js/web";
import "./index.css";
import { resolveWindowLabel } from "./lib/todayRefresh";
import App from "./App";
import TodayPopover from "./components/TodayPopover";

/** Never throw on module load — `__TAURI_INTERNALS__` may appear after first paint. */

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
