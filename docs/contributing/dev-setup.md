# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">⚙️ Dev Environment Setup</p>

**Prerequisites:** Node.js 18+, Git, Windows 10/11 (RSM is Windows-only).

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/Ronin-Server-Manager.git
cd Ronin-Server-Manager

# 2. Install dependencies
npm install

# 3. Run in development mode (opens the app with DevTools available)
npm start

# 4. Build a distributable Windows installer (outputs to /dist)
npm run dist
```

!!! tip "DevTools"
    Press `Ctrl+Shift+I` inside the running app to open Chromium DevTools for the renderer. Main process logs appear in the terminal you launched from.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🗂️ Project Structure</p>

```
RoninServerControllerApp/
├── main.js                   ← Node.js main process (IPC, process management, OS calls)
├── preload.js                ← Context bridge (security whitelist between main ↔ renderer)
├── api-server.js             ← Built-in HTTPS REST API server
├── public/
│   ├── index.html            ← App shell HTML
│   ├── renderer.js           ← UI logic (DOM, events, state)
│   ├── style.css             ← All visual styles (CSS custom properties for theming)
│   └── configs/
│       ├── index.js          ← ServerTypeRegistry (master game list)
│       ├── ServerTemplate.js ← Annotated template for new game types
│       ├── minecraft.js
│       ├── space-engineers.js
│       ├── terraria.js
│       └── ark-survival.js
├── public/logos/             ← Game icon files (PNG or SVG)
└── docs/                     ← MkDocs documentation site
```

### Key boundaries {: .rsm-header }

| File | Responsibility |
|---|---|
| `main.js` | All Node.js / OS work — process spawning, file I/O, PowerShell calls, IPC handlers |
| `preload.js` | Security gate — only whitelisted channel names can cross the process boundary |
| `renderer.js` | Everything the user sees and clicks — DOM manipulation, IPC calls, state management |
| `api-server.js` | Self-contained HTTPS server; receives deps via `init()`, never imports from `main.js` directly |
| `configs/*.js` | Pure data — no side-effects, no imports from the rest of the app |

!!! warning "Never import Node built-ins in renderer.js"
    The renderer runs in a sandboxed Chromium context. All Node.js and Electron APIs must go through the IPC bridge. If you need new OS functionality, add an `ipcMain.handle()` in `main.js`, whitelist the channel in `preload.js`, and call it via `window.api.invoke()` in the renderer.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🪵 Logging & Debugging</p>

RSM uses a tiered logging system. Pick the right helper so verbosity can be toggled without changing logic.

### main.js helpers {: .rsm-header }

| Helper | Controlled by | When to use |
|---|---|---|
| `console.log('[RSM] ...')` | Always on | High-signal operational events — IPC handler fired, server started, API toggled |
| `DebugLog(msg)` | `DebugActive = true` | Verbose internals — PID resolution, process search steps, cleanup sequence |
| `DebugConsoleLogs(msg)` | `DebugLogging = true` | Very chatty detail — raw log-file bytes, stdout line counts |
| `DebugCpuRam(msg)` | `DebugCPURAM = true` | Per-tick CPU / RAM numbers (2-second heartbeat) |
| `mainWindow.webContents.send('system-info', msg)` | Always on | Anything the admin should see in the **Home Page console** — server relinks, scan results, notable state changes |

### renderer.js helpers {: .rsm-header }

| Helper | Controlled by | When to use |
|---|---|---|
| `console.log('[RSM] ...')` | Always on | Mid-level events visible in DevTools — function entered, IPC sent |
| `DebugLog(msg)` | `DebugActive = true` | Verbose UI internals — modal state, field population, DOM lookups |
| `DebugConsoleLogs(msg)` | `DebugLogging = true` | Very chatty sub-operation detail |
| `SystemLog(msg)` | Always on | Notable one-off actions the admin should see — writes to **both** DevTools console and the **Home Page console** |

### Rules {: .rsm-header }

- **`SystemLog` is for discrete actions only.** Never call it inside a `setInterval`, polling loop, or anything that fires more than once per user action — it will flood the home console.
- **`DebugLog` is for things that are only useful when debugging.** If a log is always useful, use `console.log` or `SystemLog` instead.
- **`system-info` from main flows to the home console automatically.** The renderer's `window.api.receive('system-info', ...)` listener forwards every message to `updateSystemLog` — you do not need to do anything extra on the renderer side.
- **Set `DebugActive = false` before a release build** to silence the verbose `DebugLog` tier in both files.

### Quick reference {: .rsm-header }

```
I want to...                                      Use
─────────────────────────────────────────────    ──────────────────────────────────────
Log that an IPC handler was called (main)     →  console.log('[RSM] ...')
Log a PID search step or cleanup detail       →  DebugLog(msg)
Log raw stdout bytes / log-tail stats         →  DebugConsoleLogs(msg)
Log per-tick CPU/RAM numbers                  →  DebugCpuRam(msg)
Show something in the Home Page console (main)→  mainWindow.webContents.send('system-info', msg)
Log a renderer action (DevTools only)         →  console.log('[RSM] ...')
Log verbose modal/field population detail     →  DebugLog(msg)
Show something in the Home Page console (renderer) → SystemLog(msg)
```

---

<p align="center"><i>Ready to add a game? Head to <a href="new-game.md">Adding a Game</a>.</i></p>
