# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🧩 UI Guide</p>

RSM's renderer is vanilla JS — no framework, no build step. The pattern for adding a new UI feature is:

1. **Add HTML** to `public/index.html`
2. **Add styles** to `public/style.css` using the existing CSS custom properties
3. **Add logic** to `public/renderer.js`
4. **Add any new IPC channels** to `preload.js` and `main.js`

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🎨 CSS Custom Properties</p>

All colours and surfaces are defined as CSS custom properties in `style.css`. Use these variables so your feature automatically respects the active theme — never hard-code colour values.

| Variable | Usage |
| :--- | :--- |
| `--accent` | Primary brand orange — borders, highlights, active states |
| `--bg` | Page background |
| `--card-bg` | Card / panel background |
| `--text` | Primary body text |
| `--dim` | Muted / secondary text |
| `--border` | Subtle divider lines |
| `--online` | Green — running / healthy indicator |
| `--offline` | Red — stopped / error indicator |
| `--starting` | Yellow — pending / loading indicator |

```css
/* ✅ Correct — uses theme variables */
.my-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    color: var(--text);
}

/* ❌ Wrong — hard-coded, breaks on theme changes */
.my-card {
    background: #1e1e1e;
    color: #ffffff;
}
```

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🗃️ Server State Object</p>

Each server in the renderer's `servers` array looks like this at runtime. This is what your UI code receives from `window.api.invoke('get-servers')` and what is pushed on every `status-change` event.

```js
{
    id:         "1774840931523",  // Unique numeric string, timestamp-based
    type:       "space-engineers",
    name:       "My SE Server",
    path:       "C:\\Servers\\SE\\SpaceEngineersDedicated.exe",
    workingDir: "C:\\ProgramData\\SpaceEngineersDedicated\\MyInstance",
    args:       "-console -ignorelastsession -path \"C:\\...\\MyInstance\"",
    logPath:    "C:\\ProgramData\\SpaceEngineersDedicated\\MyInstance",
    apiPort:    "8080",
    apiPass:    "",
    status:     "Online",     // 'Offline' | 'Starting' | 'Online'
    pid:        41484,
    category:   "POWERSHELL_BRIDGE",

    // Per-server firewall port overrides — merged with config defaults at render time.
    // Only present if the user has saved changes in the Firewall Ports card.
    firewallPorts: {
        "game": { port: 27016, tcp: false, udp: true },
        "api":  { port: 8080,  tcp: true,  udp: false }
    }
}
```

The currently selected server's ID is stored in the module-level `activeId` variable. Use `servers.find(s => s.id === activeId)` to get the active server object.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🏗️ Renderer Structure</p>

`renderer.js` is organised into logical regions, each marked with a comment banner:

| Region | Responsibility |
|---|---|
| **State / constants** | `servers`, `activeId`, `_apiConfig`, `isMuted` and other module-level variables |
| **IPC listeners** | `window.api.receive(...)` handlers — react to pushes from main |
| **Sidebar / navigation** | Server list rendering, active selection, status badges |
| **Server panel** | Detail cards (status, console, performance, config editor, firewall) |
| **Firewall (Portier)** | `renderFirewallPorts`, `applyFirewallRules`, `checkFirewallStatus`, rule table |
| **Config editor** | Tab system, file read/write, backup display |
| **Settings modal** | API config, window opacity, system log |
| **Add / Edit server modal** | Wizard fields, game config loading, validation, save |
| **Helpers** | `formatBytes`, `debounce`, date formatters, etc. |

### Adding a new panel card {: .rsm-header }

The server detail panel is built from discrete cards. To add a new one:

1. Add a `<div class="card" id="my-feature-card">` block inside `#server-detail` in `index.html`.
2. Write a `renderMyFeature(srv)` function in `renderer.js` that populates the card's DOM.
3. Call `renderMyFeature(srv)` from `selectServer(id)` so it refreshes whenever the active server changes.
4. If the card has interactive controls, attach `addEventListener` calls inside `renderMyFeature` — or use event delegation on a stable parent element.

!!! warning "DOM IDs and selectServer"
    `selectServer(id)` is called both on user click and on status-change pushes from main. Make sure `renderMyFeature` is idempotent — replacing innerHTML each call is fine, but avoid creating duplicate listeners by using `addEventListener` on elements that persist across renders. Prefer `onclick =` assignment, or `removeEventListener` + `addEventListener`.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🔗 Calling IPC from the Renderer</p>

All communication with the main process goes through `window.api`, which is injected by `preload.js`:

```js
// One-way — fire and forget
window.api.send('save-servers', servers);

// Two-way — awaits a response
const result = await window.api.invoke('check-admin');

// Listen for pushes from main
window.api.receive('status-change', (data) => {
    // data is already stripped of the IPC event object
    updateServerStatus(data.id, data.status, data.pid);
});
```

!!! danger "Never import Node built-ins in renderer.js"
    The renderer runs in a sandboxed Chromium context. `require`, `fs`, `path`, `child_process`, and all other Node APIs are unavailable. If you need new OS-level functionality, add an `ipcMain.handle()` in `main.js`, whitelist the channel in `preload.js`, and call it via `window.api.invoke()`.

---

<p align="center"><i>Done building your feature? Head to the <a href="checklist.md">Checklist</a> before opening a PR.</i></p>
