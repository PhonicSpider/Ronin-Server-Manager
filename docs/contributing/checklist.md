# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">✅ Pre-PR Checklist</p>

Before opening a pull request, run through this list. Every item below has caused a review round-trip at least once.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🎮 New Game Type</p>

<div class="grid cards" markdown>

-   :material-file-plus: **Config file created**

    ---
    `public/configs/your-game.js`--all required fields present, no leftover template placeholders. `meta.displayName`, `meta.icon`, `backend.category`, `blocks`, `defaults`, and `varInputs` are all set. `backend.logNoisePatterns` is fine left as `[]` for now--don't guess at noise patterns before you've seen a real log.

-   :material-image: **Icon added**

    ---
    `public/logos/yourGameLogo.png`--square, ≤64 px, referenced in `meta.icon` as a path relative to `/public`.

-   :material-format-list-bulleted: **Index updated**

    ---
    Imported and registered in `public/configs/index.js` with a lowercase kebab-case key. The key becomes `srv.type` in the saved JSON.

-   :material-code-braces: **Category registered**

    ---
    Game type key added to the correct `case` block in `findServType()` in `main.js`--either `DIRECT_CONSOLE` or `POWERSHELL_BRIDGE`.

-   :material-fire: **Firewall ports defined** *(if applicable)*

    ---
    `firewallPorts` array added to the game config with sensible defaults for each port the server needs (game port, query port, RCON, API, etc.).

-   :material-lightning-bolt: **Quick actions added** *(if applicable)*

    ---
    `quickActions` array present if the server has an interactive console or RCON. Omit entirely if the game has no command interface.

-   :material-file-document: **Server docs page added**

    ---
    `docs/servers/your-game.md` following the format of the existing server guides. Registered in `mkdocs.yml` under the Server Setup section.

</div>

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">📡 New IPC Channel</p>

<div class="grid cards" markdown>

-   :material-lock-check: **Channel whitelisted in preload.js**

    ---
    Added to the correct whitelist array--`send`, `receive`, or `invoke`. Missing whitelist entries are silently blocked with no error.

-   :material-code-tags: **Handler added in main.js**

    ---
    `ipcMain.on()` for send channels, `ipcMain.handle()` for invoke channels. Handler returns a plain object (not a class instance).

-   :material-table: **Channel listed in docs**

    ---
    Row added to the channel table in `docs/contributing/ipc-channels.md` with the correct direction and a description of the payload shape.

</div>

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🌐 New REST API Endpoint</p>

<div class="grid cards" markdown>

-   :material-api: **Route added to api-server.js**

    ---
    Added inside `dispatch()`. Uses `respond()` helper for all replies. Authentication is already handled before `dispatch()` is called--do not re-check the API key inside the handler.

-   :material-shield-check: **Input validated**

    ---
    Any path parameter or body field that is used in a system call (process ID, file path, command string) is validated or sanitised before use.

-   :material-book-open: **Endpoint documented**

    ---
    Added to `docs/discord-Int.md` API reference table and, if applicable, to `docs/contributing/rest-api.md`.

</div>

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🪵 Logging</p>

<div class="grid cards" markdown>

-   :material-console-line: **Used the right logging tier**

    ---
    Every `console.log` / `DebugLog` / `SystemLog` call is at the correct level. See the [Logging & Debugging](dev-setup.md#logging-debugging) section for the full decision table. Quick rules:

    - `SystemLog(msg)`--renderer, notable one-off action, also shows in the Home Page console
    - `DebugLog(msg)`--verbose internals gated behind `DebugActive`
    - `mainWindow.webContents.send('system-info', msg)`--main process, shows in Home Page console
    - `console.log('[RSM] ...')`--always-on operational log, DevTools / terminal only

-   :material-close-circle-outline: **No polling-loop logs**

    ---
    No `SystemLog`, `DebugLog`, or `system-info` calls inside `setInterval`, heartbeat ticks, or any handler that fires more than once per user action. High-frequency logs flood the home console and fill the DevTools with noise.

</div>

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🧪 Testing</p>

<div class="grid cards" markdown>

-   :material-play-circle: **Server lifecycle tested**

    ---
    Server starts, transitions through `Starting → Online`, stops, and returns to `Offline`. Status dot updates in the sidebar correctly throughout.

-   :material-console: **Console output flows**

    ---
    For `DIRECT_CONSOLE` servers: stdout appears in the RSM console panel in real time. For `POWERSHELL_BRIDGE` servers: log file is tailed (including a backfill of existing content on attach) and new lines appear with no excessive lag. If the log is full of engine boilerplate (asset loading, periodic stat dumps, telemetry), add real patterns to `backend.logNoisePatterns` in the config--verify each one against actual log output first, never guess.

-   :material-lightning-bolt: **Quick actions work** *(if added)*

    ---
    Each quick action button sends the command without a JavaScript error. The command appears in the console panel as expected.

-   :material-monitor: **No regressions**

    ---
    At least one existing server type has been tested after your change. Switching between servers, opening settings, and restarting the app all behave normally.

</div>

---

!!! tip "Opening the PR"
    Make sure your branch is up to date with `master` before submitting. Include a short description of what the change does and, for new game types, a screenshot of the server panel.

---

<p align="center"><i>All green? Open your pull request on <a href="https://github.com/PhonicSpider/Ronin-Server-Manager/pulls">GitHub</a>.</i></p>
