# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">📡 IPC Channel Reference</p>

RSM uses Electron's IPC to communicate between the **main process** (`main.js`) and the **renderer** (`renderer.js`). All channels must be whitelisted in `preload.js` before they can be used.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">The Three IPC Patterns</p>

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

    // Renderer listener--note: only ONE parameter (no leading 'event' arg)
    window.api.receive('my-push-channel', (data) => {
        console.log(data);
    });

    // Main sends to renderer
    mainWindow.webContents.send('my-push-channel', { some: 'data' });
    //--or reply on an existing event --
    event.reply('my-push-channel', { some: 'data' });
    ```

=== ":material-arrow-left-right: invoke (Two-way, Renderer asks Main)"
    Renderer awaits a response from Main. Used for data fetches and operations that return a result.

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
    Any channel not listed in `preload.js` is silently blocked. If your feature does nothing when triggered, this is almost always the cause. Add to the correct whitelist array--`send`, `receive`, or `invoke`--before testing.

!!! danger "Renderer Receive Callbacks--No `event` Parameter"
    The preload strips the Electron IPC `event` object before passing data to the renderer. Receive callbacks take **only the data** as their argument:

    ```js
    // ✅ Correct
    window.api.receive('status-change', (data) => { ... });

    // ❌ Wrong--data will always be undefined
    window.api.receive('status-change', (event, data) => { ... });
    ```

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">Current Channel List</p>

| Channel | Direction | Description |
| :--- | :--- | :--- |
| `start-server` | send | Start a server--passes the full server object |
| `stop-server` | send | Graceful shutdown by server ID |
| `kill-server` | send | Force-kill by PID |
| `send-command` | send | Send a console command `{ srvId, command }` |
| `save-servers` | send | Persist current server list to disk |
| `save-api-config` | send | Save and apply REST API config `{ enabled, port, apiKey }` |
| `open-folder` | send | Open a path in Windows Explorer |
| `log-to-system` | send | Write a message to the system log |
| `update-window-opacity` | send | Set the app window transparency `(0.0–1.0)` |
| `open-docs` | send | Open the documentation site in the browser |
| `console-out` | receive | Server console line `{ id, msg }` |
| `status-change` | receive | Status update `{ id, status, pid? }` |
| `server-perf-update` | receive | Per-server CPU/RAM `{ id, cpu, ramPercent, ramDisplay }` |
| `total-performance-update` | receive | Machine-wide CPU/RAM `{ cpu, ram }` |
| `network-stats-update` | receive | System-wide bandwidth `{ rxSec, txSec }` in bytes/s |
| `server-connections-update` | receive | Per-server ESTABLISHED TCP connection count `{ id, connections }` |
| `player-count-update` | receive | Player count result `{ id, players, world? }` |
| `system-info` | receive | Info message for the system log |
| `system-error` | receive | Error message for the system log |
| `startup-scan-complete` | receive | Fired once when the startup process scan finishes `{ linked, total }`--used to dismiss the init overlay |
| `get-servers` | invoke | Fetch current server list → `Server[]` |
| `get-settings` | invoke | Fetch app settings |
| `check-admin` | invoke | Returns `true` if RSM has Administrator privileges |
| `open-dialog` | invoke | Open a file-picker dialog → `filePath \| null` |
| `select-folder` | invoke | Open a folder-picker dialog → `folderPath \| null` |
| `get-desktop-path` | invoke | Returns the Windows Desktop path |
| `read-config-file` | invoke | Read a config file `filePath → { success, content }` |
| `write-config-file` | invoke | Write content to a config file `{ filePath, content, backupDir?, serverName? } → { success, backedUp }` |
| `apply-firewall-rules` | invoke | Create inbound Windows Firewall rules `{ serverName, ports[] } → { success }` |
| `remove-firewall-rules` | invoke | Remove all RSM rules for a server `{ serverName } → { success }` |
| `check-firewall-rules` | invoke | Check if any RSM rules exist `{ serverName } → boolean` |
| `get-firewall-rules` | invoke | List all rules in the `Ronin Portier Rules` group `→ [{ name, protocol, port, enabled }]` |
| `add-firewall-rule` | invoke | Create a single custom rule `{ displayName, port, tcp, udp } → { success }` |
| `remove-firewall-rule` | invoke | Remove a single rule by display name `{ displayName } → { success }` |
| `toggle-firewall-rule` | invoke | Enable or disable a rule `{ displayName, enabled } → { success }` |
| `check-port-conflicts` | invoke | Check if ports are already claimed `{ ports[], excludeServerName? } → Conflict[]` |
| `get-api-config` | invoke | Fetch current REST API config → `{ enabled, port, apiKey }` |
| `regenerate-api-key` | invoke | Generate a new API key and save → returns updated config |

---

<p align="center"><i>Adding a new IPC channel? Don't forget to add it to this table and whitelist it in <code>preload.js</code>.</i></p>
