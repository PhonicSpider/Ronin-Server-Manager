# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🔥 Contributing to RSM</p>

!!! abstract "Welcome, Contributor"
    Ronin Server Manager is built on **Electron** with a Node.js main process and a vanilla JS renderer. This guide covers everything you need to add a new game server type, wire up new IPC features, or extend the UI — without breaking anything that already works.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🛠️ Dev Environment Setup</p>

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

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🎮 Adding a New Game Server</p>

Adding a game type involves **four required steps** and one optional one. Each step is described below.

<div class="grid cards" markdown>

-   :material-numeric-1-circle: **Create the Config File**

    ---
    `public/configs/your-game.js`

-   :material-numeric-2-circle: **Add an Icon**

    ---
    `public/logos/yourGameLogo.png`

-   :material-numeric-3-circle: **Register in the Index**

    ---
    `public/configs/index.js`

-   :material-numeric-4-circle: **Register the Category**

    ---
    `main.js → findServType()`

-   :material-numeric-5-circle: **Add Quick Actions** *(optional)*

    ---
    `quickActions` array in your config file

</div>

---

### Step 1 — Create the Config File {: .rsm-header }

Copy `public/configs/ServerTemplate.js` and fill it in for your game. Every field is documented inline in the template. Here is the full structure with explanations:

```js
export const yourGame = {

    // ── META ─────────────────────────────────────────────────────────────────
    meta: {
        displayName: "Your Game",          // Shown in the 'Add Server' picker
        icon: "logos/yourGameLogo.png"     // Path relative to /public
    },

    // ── BACKEND ──────────────────────────────────────────────────────────────
    backend: {
        // DIRECT_CONSOLE  — RSM spawns the process directly and pipes stdin/stdout.
        //                   Use for Java servers and any EXE where you want live
        //                   console I/O (Minecraft, 7 Days to Die, etc.)
        //
        // POWERSHELL_BRIDGE — RSM launches the EXE hidden via PowerShell, then
        //                     finds the real game PID through a deep search.
        //                     Use for native Windows EXEs that open their own
        //                     window (Space Engineers, Ark, Terraria, etc.)
        category: "POWERSHELL_BRIDGE"
    },

    // ── SETUP MODAL ──────────────────────────────────────────────────────────
    label: "SERVER EXECUTABLE (GameServer.exe)",  // Label above the EXE path field

    // Controls which input fields appear in the Add Server wizard.
    // 'block' = visible   'none' = hidden
    blocks: {
        path:       'block',   // Main executable path
        workingDir: 'block',   // Working/instance directory
        args:       'block',   // Launch arguments
        log:        'none',    // External log file path  (for POWERSHELL_BRIDGE log tailing)
        port:       'none',    // API / RCON port
        portPass:   'none'     // API / RCON password
    },

    // Placeholder text OR pre-filled default values for each visible field.
    defaults: {
        newName:    "e.g. My Game Server",
        exePath:    "C:\\Servers\\YourGame\\GameServer.exe",
        workingDir: "C:\\Servers\\YourGame",
        customArgs: "-launch -flags",
        logPath:    "C:\\Servers\\YourGame\\Logs",
        portId:     "27020",
        portPass:   "your-password"
    },

    // 'placeholder' = shown as grey hint text
    // 'value'       = pre-filled as an actual value the user can edit
    varInputs: {
        newName:    "placeholder",
        exePath:    "placeholder",
        workingDir: "placeholder",
        customArgs: "value",       // ← pre-fill args so users don't start blank
        logPath:    "placeholder",
        portId:     "placeholder",
        portPass:   "placeholder"
    },

    // ── QUICK ACTIONS (optional) ──────────────────────────────────────────────
    quickActions: [
        { label: 'List Players', command: 'listplayers' },
        { label: 'Save World',   command: 'saveworld' },
    ]
};
```

!!! warning "Working Directory — Multi-Instance Rule"
    Every instance of a game must have a **unique `workingDir`**. RSM uses this path to tell multiple instances of the same EXE apart.

    For games that self-relaunch (like Space Engineers), the `workingDir` value **must also appear somewhere in `customArgs`** (e.g. `-path "C:\Servers\MyInstance"`). This lets the deep PID search match the right process when the parent-child link is broken.

---

### Step 2 — Add an Icon {: .rsm-header }

Drop a square PNG or SVG into `public/logos/`. Keep it under 64×64px for sharp rendering at the sidebar size. Reference it in `meta.icon` as a path relative to `/public`:

```js
icon: "logos/yourGameLogo.png"
```

---

### Step 3 — Register in the Index {: .rsm-header }

Open `public/configs/index.js` and add your export in both the import block and the registry object:

```js
// 1. Import your new config
import { yourGame } from './your-game.js';

// 2. Add it to the registry — the key becomes srv.type in the saved server JSON
export const ServerTypeRegistry = {
    'minecraft':        minecraft,
    'space-engineers':  spaceEngineers,
    'terraria':         terraria,
    'ark':              ark,
    'your-game':        yourGame,   // ← add this line
};
```

!!! info "Registry Key Convention"
    Use lowercase kebab-case for the key (e.g. `'seven-days-to-die'`). This value is stored in `servers.json` as `srv.type` and is used everywhere RSM identifies server behaviour.

---

### Step 4 — Register the Category in `main.js` {: .rsm-header }

Open `main.js` and find the `findServType()` function near the bottom. Add your game's registry key to the correct `case` group:

```js
function findServType(srv) {
    const type = (srv.type || '').toLowerCase();

    switch (type) {
        case 'minecraft':
        case '7daystodie':
        case 'terraria':
        case 'your-game':            // ← DIRECT_CONSOLE games go here
            return 'DIRECT_CONSOLE';

        case 'space-engineers':
        case 'ark':
        case 'your-other-game':      // ← POWERSHELL_BRIDGE games go here
            return 'POWERSHELL_BRIDGE';

        default:
            return 'DIRECT_CONSOLE';
    }
}
```

#### Which category do I use? {: .rsm-header }

=== ":material-console: DIRECT_CONSOLE"
    RSM spawns the process directly using Node's `child_process.spawn()`. It pipes `stdin` and `stdout` so console output appears in real time and commands can be sent directly.

    **Use when:**

    * The server runs as a single foreground process (Java, most script runners)
    * You want live console output without a log file
    * Commands can be sent by writing to stdin (e.g. `list\n`)

    **Examples:** Minecraft, 7 Days to Die, Terraria

=== ":material-powershell: POWERSHELL_BRIDGE"
    RSM launches the EXE hidden via PowerShell (`Start-Process -WindowStyle Hidden`), captures the spawned PID, then monitors the process via WMIC heartbeat. Console output is read by tailing the server's log file on disk.

    **Use when:**

    * The EXE opens its own GUI window (most native Windows game servers)
    * The server needs to run headless in the background
    * Commands are sent via RCON or an HTTP API (not stdin)

    **Examples:** Space Engineers, Ark

---

### Step 5 — Add Quick Actions *(optional)* {: .rsm-header }

Quick actions are one-click buttons that appear in the RSM dashboard when a server is selected. Each entry sends a command through whichever command path the server supports (stdin for `DIRECT_CONSOLE`, RCON/HTTP API for `POWERSHELL_BRIDGE`).

```js
quickActions: [
    { label: 'List Players',  command: 'listplayers' },
    { label: 'Save World',    command: 'saveworld' },
    { label: 'Kick All',      command: 'kickall' },
]
```

| Field | Purpose |
| :--- | :--- |
| `label` | Button text shown in the UI |
| `command` | The exact command string sent to the server |

!!! tip "No Quick Actions?"
    If the game has no interactive console (e.g. Terraria, which has no RCON), simply omit the `quickActions` array entirely. The Quick Actions card will not appear for that server type.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">📡 IPC Channel Reference</p>

RSM uses Electron's IPC to communicate between the **main process** (`main.js`) and the **renderer** (`renderer.js`). All channels must be whitelisted in `preload.js` before they can be used.

### The Three IPC Patterns {: .rsm-header }

=== ":material-arrow-right: send (One-way, Renderer → Main)"
    Renderer fires and forgets. Main does not reply on the same call.

    ```js
    // preload.js whitelist
    let validChannels = ['save-servers', 'start-server', 'stop-server', /* ... */];

    // Renderer usage
    window.api.send('my-new-channel', { some: 'data' });

    // Main handler
    ipcMain.on('my-new-channel', (event, data) => { ... });
    ```

=== ":material-arrow-left: receive (One-way, Main → Renderer)"
    Main pushes data to the renderer at any time (status updates, logs, metrics).

    ```js
    // preload.js whitelist
    let validChannels = ['server-status-updated', 'console-out', /* ... */];

    // Renderer listener — note: only ONE parameter (no leading 'event' arg)
    window.api.receive('my-push-channel', (data) => {
        console.log(data);
    });

    // Main sends to renderer
    mainWindow.webContents.send('my-push-channel', { some: 'data' });
    // — or reply on an existing event —
    event.reply('my-push-channel', { some: 'data' });
    ```

=== ":material-arrow-left-right: invoke (Two-way, Renderer asks Main)"
    Renderer awaits a response from Main. Used for data fetches.

    ```js
    // preload.js whitelist
    let validChannels = ['get-servers', 'get-settings', /* ... */];

    // Renderer usage (async)
    const result = await window.api.invoke('my-query-channel', { id: '123' });

    // Main handler
    ipcMain.handle('my-query-channel', async (event, data) => {
        return { result: 'something' };
    });
    ```

!!! warning "Whitelist All New Channels"
    Any channel not listed in `preload.js` is silently blocked. If your feature does nothing when triggered, this is almost always the cause. Add to the correct whitelist array — `send`, `receive`, or `invoke` — before testing.

!!! danger "Renderer Receive Callbacks — No `event` Parameter"
    The preload strips the Electron IPC `event` object before passing data to the renderer. Receive callbacks take **only the data** as their argument:

    ```js
    // ✅ Correct
    window.api.receive('status-change', (data) => { ... });

    // ❌ Wrong — data will always be undefined
    window.api.receive('status-change', (event, data) => { ... });
    ```

### Current Channel List {: .rsm-header }

| Channel | Direction | Description |
| :--- | :--- | :--- |
| `start-server` | send | Start a server by ID |
| `stop-server` | send | Graceful shutdown by ID |
| `kill-server` | send | Force-kill by PID |
| `send-command` | send | Send a console command `{ srvId, command }` |
| `save-servers` | send | Persist current server list to disk |
| `open-folder` | send | Open a path in Windows Explorer |
| `log-to-system` | send | Write a message to the system log |
| `console-out` | receive | Server console line `{ id, msg }` |
| `status-change` | receive | Status update `{ id, status, pid? }` |
| `server-perf-update` | receive | Per-server CPU/RAM `{ id, cpu, ramPercent, ramDisplay }` |
| `total-performance-update` | receive | Machine-wide CPU/RAM `{ cpu, ram }` |
| `system-info` | receive | Info message for the system log |
| `system-error` | receive | Error message for the system log |
| `server-status-updated` | receive | Full server list refresh |
| `load-servers` | receive | Initial server list on app start |
| `read-config-file` | invoke | Read a config file from disk `filePath → { success, content }` |
| `write-config-file` | invoke | Write content to a config file `{ filePath, content } → { success }` |
| `get-servers` | invoke | Fetch current server list |
| `get-settings` | invoke | Fetch app settings |
| `check-admin` | invoke | Check if RSM is running as Administrator |
| `open-dialog` | invoke | Open a file-picker dialog |
| `select-folder` | invoke | Open a folder-picker dialog |

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🧩 Adding UI Features</p>

RSM's renderer is vanilla JS — no framework. The pattern for adding a new UI feature is:

1. **Add HTML** to `public/index.html`
2. **Add styles** to `public/style.css` using the existing CSS custom properties
3. **Add logic** to `public/renderer.js`
4. **Add any new IPC channels** to `preload.js` and `main.js`

### CSS Custom Properties {: .rsm-header }

Use these variables so your feature automatically respects the active theme:

| Variable | Usage |
| :--- | :--- |
| `--accent` | Primary brand orange — borders, highlights, active states |
| `--bg` | Page background |
| `--card-bg` | Card/panel background |
| `--text` | Primary text |
| `--dim` | Muted/secondary text |
| `--border` | Subtle divider lines |
| `--online` | Green — running/healthy indicator |
| `--offline` | Red — stopped/error indicator |
| `--starting` | Yellow — pending/loading indicator |

### Server State Object {: .rsm-header }

Each server in the renderer's `servers` array looks like this at runtime:

```js
{
    id:         "1774840931523",  // Unique numeric string, timestamp-based
    type:       "space-engineers",
    name:       "My SE Server",
    path:       "C:\\...\\SpaceEngineersDedicated.exe",
    workingDir: "C:\\ProgramData\\SpaceEngineersDedicated\\MyInstance",
    args:       "-console -ignorelastsession -path \"C:\\...\\MyInstance\"",
    logPath:    "C:\\ProgramData\\SpaceEngineersDedicated\\MyInstance",
    apiPort:    "8080",
    apiPass:    "",
    status:     "Online",     // 'Offline' | 'Starting' | 'Online'
    pid:        41484,
    category:   "POWERSHELL_BRIDGE"
}
```

The currently selected server's ID is stored in the `activeId` variable. Use `servers.find(s => s.id === activeId)` to get the active server object.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">✅ Contribution Checklist</p>

Before opening a pull request, run through this list:

<div class="grid cards" markdown>

-   :material-file-plus: **New config file created**

    ---
    `public/configs/your-game.js` — all required fields present, no leftover template placeholders.

-   :material-image: **Icon added**

    ---
    `public/logos/yourGameLogo.png` — square, ≤64px, referenced in `meta.icon`.

-   :material-format-list-bulleted: **Index updated**

    ---
    Imported and registered in `public/configs/index.js` with a lowercase kebab-case key.

-   :material-code-braces: **Category registered**

    ---
    Game type key added to the correct `case` in `findServType()` in `main.js`.

-   :material-lock-check: **IPC whitelisted**

    ---
    Any new channels added to the correct whitelist array in `preload.js`.

-   :material-test-tube: **Tested locally**

    ---
    Server starts, stops, and graceful-shutdown dot updates correctly. Console output flows. Quick actions (if any) send commands without errors.

-   :material-file-document: **Docs page added** *(for new game types)*

    ---
    `docs/servers/your-game.md` following the format of the existing server guides.

</div>

---

<p align="center">
  <i><b>Questions?</b> Open an issue on GitHub or check the <a href="troubleshooting.md">Troubleshooting Guide</a> for common gotchas.</i>
</p>
