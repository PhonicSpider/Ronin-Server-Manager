# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🎮 Adding a New Game Server</p>

Adding a game type involves **four required steps** and one optional one. Each step is described in full below.

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

    // ── FIREWALL PORTS (optional) ────────────────────────────────────────────
    // Each entry creates a row in the server panel's Firewall Ports card.
    // Per-server port overrides are saved in servers.json and merged at runtime.
    firewallPorts: [
        { id: 'game',  label: 'Game Port', default: 25565, tcp: true,  udp: true,  description: 'Player connections' },
        { id: 'rcon',  label: 'RCON',      default: 25575, tcp: true,  udp: false, description: 'Admin console' },
    ],

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
    If the game has no interactive console, simply omit the `quickActions` array. The Quick Actions card will not appear for that server type.

---

<p align="center"><i>Once your game is added, don't forget to add a docs page at <code>docs/servers/your-game.md</code> and check the <a href="checklist.md">Checklist</a> before opening a PR.</i></p>
