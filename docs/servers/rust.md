# :material-pickaxe: Rust {: .rsm-header }

!!! abstract "PowerShell Integration"
    Rust runs as a persistent Windows process. RSM uses a **PowerShell Bridge** to launch and track it, and tails a log file on disk for console output.

!!! abstract "RCON via WebRCON -- a WebSocket protocol, not Source RCON"
    Rust's remote console is **WebRCON**, a WebSocket-based JSON protocol -- not the classic Source RCON protocol most other RSM-supported games use. RSM speaks WebRCON natively for Rust (a dedicated client, separate from the Source RCON path used elsewhere), so player count and RCON-based Quick Actions both work. Start/stop, console log tailing, config editing, and firewall management all work the same as any other title.

---

## ⚠️ Pre-Configuration Steps {: .rsm-header }

1.  **Enable Logging:** Rust (Unity) no longer writes a log file by default as of a recent engine update. Add `-logfile "path\to\log.txt"` to your Arguments (RSM's preset includes this by default). Without it, the Console tab stays empty even while the server runs fine.
2.  **RCON Port/Password:** Rust's `server.cfg` or launch args (`+rcon.port`, `+rcon.password`, `+rcon.web 1`) configure WebRCON. Fill in RSM's Port/Password fields with the same values -- RSM connects to `ws://127.0.0.1:{port}/{password}` to issue commands and fetch the player list.
3.  **File Location:** Locate these paths before starting the RSM Wizard:
    1.  __Server EXE:__ Usually located at `...\RustDedicated.exe`, directly in the install root.
    2.  __Working Directory:__ The install root containing `RustDedicated.exe`.
    3.  __Config File:__ `server.cfg`, under `server\server1\cfg` (or whatever identity name you use in place of `server1`).
    4.  __Log File:__ Wherever you pointed `-logfile` -- RSM's preset uses `rust-console.log` inside the install directory.

---

## ⚙️ Startup Arguments {: .rsm-header }

| Flag | Function |
| :--- | :--- |
| `+server.identity "server1"` | Names this instance's save/config folder. Must be unique per instance. |
| `+server.port 28015` | The game connection port. |
| `+rcon.port 28016` | WebRCON port -- must match RSM's Port field. |
| `+rcon.password "..."` | WebRCON password -- must match RSM's Password field. |
| `+rcon.web 1` | Enables the WebRCON listener. Required -- without it, RSM's player count and Quick Actions have nothing to connect to. |
| `-logfile "..."` | **Required for console output.** Rust writes nothing to disk without this. |

RSM's config editor can parse an existing `server.cfg` and auto-fill the port/password fields when adding an existing install.

---

## 🚀 Adding to RSM {: .rsm-header }

1.  **Open Manager:** Click **Add Server** and select the **Rust** card.
2.  **Fill Fields:** Paste your `RustDedicated.exe` path. RSM will attempt to auto-fill the Working Directory for you.
3.  **Set the Log Path:** Point RSM at your `-logfile` destination. If adding an existing install with config already parsed, RSM auto-fills this.
4.  **Set the RCON Port/Password:** Match whatever `+rcon.port`/`+rcon.password` you launch with -- this is what powers player count and Quick Actions.
5.  **Save & Start:** Once saved, hit **Start**.

---

## 🔍 Troubleshooting {: .rsm-header }

* **Console is empty:** Confirm `-logfile` is in your Arguments and points to the same path as RSM's **Log Path** field.
* **Player count / Quick Actions show nothing:** Confirm `+rcon.web 1` is in your Arguments (WebRCON is off without it) and that RSM's Port/Password fields exactly match `+rcon.port`/`+rcon.password`.
* **Multiple instances conflict:** Each instance needs a unique `+server.identity` value and its own set of ports (game, query, RCON).

---

<p align="center">
  <i><b>Note:</b> RSM's WebRCON client connects fresh for each command/player-count poll rather than holding a persistent socket open. For heavy scripted use beyond what Quick Actions cover, a dedicated WebRCON tool (rustadmin, or a browser-based WebRCON client) is still a reasonable choice.</i>
</p>
