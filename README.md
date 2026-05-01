# Weekly Todo

Offline-first weekly task planner: recurring rules in a **week grid**, optional **property columns** (status, priority, etc.), **system tray** quick view for today, and optional **daily reminder** notifications. Built with **Tauri 2**, **SolidJS**, **Tailwind CSS**, and **SQLite** (local data only).

## Features

- Week view with per-day tasks, filters, and hidden property columns
- Task rules: weekdays, description, defaults per property schema, **anchor week** (instances only in the week you created the rule)
- Property schemas (enum options with colors); delete schema cleans task JSON
- Tray **Today** popover: draggable, theme-aware, expandable task descriptions
- **Theme**: System / Light / Dark (persisted, synced between windows)
- Data stays on device: SQLite in the OS app data directory

## Requirements

- **Node.js** 18+ and npm
- **Rust** stable ([rustup](https://rustup.rs/))
- **Platform tooling** — follow [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS (Windows: MSVC + WebView2; macOS: Xcode CLT; Linux: webkit2gtk, etc.)

## Development

```bash
npm install
npm run tauri dev
```

Runs the Vite dev server (default port **1420**) and launches the desktop app.

| Script          | Description                          |
| ----------------| -------------------------------------|
| `npm run dev`   | Vite only (browser / without shell)  |
| `npm run build` | Production frontend → `dist/`        |
| `npm run tauri dev` | Frontend + Tauri desktop         |
| `npm run tauri build` | Installer/bundle via Tauri   |

## Production build

```bash
npm run tauri build
```

Installers and bundles are written under **`src-tauri/target/release/bundle/`** (formats depend on OS: `.msi`, `.exe`, `.dmg`, `.AppImage`, etc.). Prebuilt binaries are **not** committed to this repo; use [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) (or CI) to publish artifacts.

## Data & privacy

- Database file: **`fast-todo.db`** in the app’s data directory (path is OS-specific; Tauri resolves it per `identifier` in `src-tauri/tauri.conf.json`).
- No account or cloud sync; backup by copying that file while the app is closed.

## Project layout

- `src/` — SolidJS UI, `api.ts` (Tauri invoke), `lib/` helpers
- `src-tauri/` — Rust backend, SQLite, tray, window config
- `index.html` / `vite.config.ts` — frontend entry and tooling

## Contributing

Issues and pull requests are welcome. Please run `npm run build` and `cargo build` (from `src-tauri/`) before submitting, and match existing style in small, focused changes.

## License

[MIT](LICENSE)
