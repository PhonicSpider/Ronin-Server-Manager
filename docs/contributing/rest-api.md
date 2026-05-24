# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🌐 REST API</p>

RSM includes a self-contained HTTPS REST API in `api-server.js`. This page covers how it is architected, how to add new endpoints, and how to wire up player-count or command support for a new game type.

!!! info "User-facing API docs"
    If you are looking for how to *use* the API from a Discord bot or external tool, see [Discord Integration](../discord-int.md) instead. This page is for contributors who want to extend the API itself.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🏗️ Architecture</p>

`api-server.js` is completely self-contained — it never imports from `main.js` directly. Instead, `main.js` calls `init(deps)` at startup to inject the closures the API needs:

```js
// main.js — wires the API server to the rest of the app
apiServer.init({
    getManagedServers:  () => managedServers,
    getActiveProcesses: () => activeProcesses,
    getServerStats:     () => serverStats,
    getMainWindow:      () => mainWindow,
    findServType:       findServType,
    ipcMain:            ipcMain
});
```

This inversion of control means:

- `api-server.js` can be unit-tested in isolation by injecting mock closures
- Adding a new endpoint never requires touching `main.js`
- The API has no import-time side effects — it only starts listening when `start()` is called

### Lifecycle {: .rsm-header }

```
init(deps)   → stores injected closures, no I/O
start(port, apiKey, tlsOpts)
             → no-op if already running on the same port/key
             → creates HTTPS server (or HTTP if no TLS opts), binds to 0.0.0.0
stop()       → closes the server, resets state
```

`start()` is called by the `save-api-config` IPC handler whenever the user saves settings, and at app boot if the API was previously enabled.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🔄 Request Flow</p>

```
HTTPS request
    └─ onRequest()         collect POST body (or drain GET)
        └─ dispatch()
            ├─ CORS preflight?  → 204 + headers
            ├─ Auth check       → 401 if key missing/wrong
            └─ Route matching   → handler or 404
```

Every response goes through the `respond(res, status, body)` helper, which sets `Content-Type: application/json`, the status code, and serialises the body. Always use it — never write to `res` directly.

```js
function respond(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify(body));
}
```

### Authentication {: .rsm-header }

Auth is checked once in `dispatch()` before any route matching runs. It uses `crypto.timingSafeEqual` so the comparison time does not leak information about how much of the key matched:

```js
const expected = Buffer.from(_apiKey);
const received = Buffer.from(req.headers['x-api-key'] || '');
if (expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)) {
    return respond(res, 401, { error: 'Unauthorized' });
}
```

You do not need to re-check the key inside individual route handlers.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">➕ Adding a New Endpoint</p>

All routing lives inside `dispatch()` as a chain of `if` checks on `method` and `url`. Add your route at the end of the chain, before the final `404` fallback:

```js
// Example: GET /api/servers/:id/uptime
if (method === 'GET' && parts[0] === 'api' && parts[1] === 'servers'
    && parts[3] === 'uptime' && parts[2]) {

    const srv = _getManagedServers().find(s => s.id === parts[2]);
    if (!srv) return respond(res, 404, { error: 'Server not found' });

    const uptimeSec = srv.startedAt ? Math.floor((Date.now() - srv.startedAt) / 1000) : null;
    return respond(res, 200, { id: srv.id, uptimeSeconds: uptimeSec });
}
```

`parts` is the URL path split on `/` with the leading slash removed, so `/api/servers/123/uptime` → `['api', 'servers', '123', 'uptime']`.

### Triggering existing IPC handlers {: .rsm-header }

For actions that already have an `ipcMain.on()` or `ipcMain.handle()` handler in `main.js` (start, stop, send-command), use `makeReplyEvent()` to create a fake IPC event and emit directly:

```js
function makeReplyEvent() {
    return {
        reply: (channel, data) => {
            const win = _getMainWindow();
            if (win) win.webContents.send(channel, data);
        }
    };
}

// Trigger the existing 'start-server' handler without duplicating its logic
_ipcMain.emit('start-server', makeReplyEvent(), { ...srv });
```

`ipcMain` extends Node's `EventEmitter`, so `.emit()` calls the registered `.on()` listener synchronously with the fake event object.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🎮 Adding Command Support for a New Game</p>

`executeCommand(srv, command)` routes commands by game type. To add support for a new game, extend the switch statement:

```js
async function executeCommand(srv, command) {
    const type = _findServType(srv);

    switch (type) {
        case 'DIRECT_CONSOLE': {
            // Write to stdin, capture stdout for 1.5 s
            const proc = _getActiveProcesses()[srv.id];
            if (!proc) throw new Error('Process not found');
            proc.stdin.write(command + '\n');
            const output = await captureOutput(proc, 1500);
            return { success: true, output };
        }

        case 'POWERSHELL_BRIDGE': {
            // Add a new sub-case here for your game's command interface
            if (srv.type === 'your-game') {
                const result = await sendViaYourGameApi(srv, command);
                return { success: true, output: result };
            }
            // Fallback: RCON
            return await sendRcon(srv, command);
        }
    }
}
```

### Implementing `fetchPlayers` for a new game {: .rsm-header }

`fetchPlayers(srv)` follows the same pattern. Add a case for your game's query method before the default fallback:

```js
async function fetchPlayers(srv) {
    switch (srv.type) {
        case 'minecraft':   return await fetchMinecraftPlayers(srv);
        case 'space-engineers': return await fetchSEPlayers(srv);
        case 'ark':         return await fetchArkPlayers(srv);

        case 'your-game':   return await fetchYourGamePlayers(srv); // ← add this

        default:
            return { online: null, max: null, players: [],
                     note: `Player query not supported for ${srv.type}` };
    }
}
```

Your fetch function should return `{ online: number, max: number | null, players: string[] }`.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🔒 Security Notes</p>

!!! warning "Input validation"
    Any path parameter (server ID) or body field used in a system call must be validated. Server IDs are looked up against the managed server list — never pass them to shell commands directly. Command strings sent via `/command` are forwarded verbatim to the server process; they are not executed by the host OS.

!!! info "TLS certificate"
    The self-signed certificate is generated at first run using the `selfsigned` package and stored on disk. Clients must either trust the cert or skip verification (`verify=False` in Python, `rejectUnauthorized: false` in Node). This is documented in the user-facing Discord Integration guide.

---

<p align="center"><i>Added a new endpoint? Don't forget to document it in <a href="../discord-int.md">Discord Integration</a> and run through the <a href="checklist.md">Checklist</a>.</i></p>
