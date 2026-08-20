# :material-sword-cross: Conan Exiles {: .rsm-header }

!!! abstract "RCON & PowerShell Integration"
    Conan Exiles runs as a persistent Windows process. RSM uses a **PowerShell Bridge** to launch and track it, and the **RCON Protocol** to send administrative commands and list connected players.

!!! warning "RCON commands are lowercase"
    Unlike Ark (which uses PascalCase commands like `ListPlayers`), Conan Exiles' RCON plugin uses lowercase command names -- `listplayers`, not `ListPlayers`. RSM's built-in Quick Actions already use the correct casing; if you're sending commands manually through the console, keep this in mind.

---

## ⚠️ Pre-Configuration Steps {: .rsm-header }

Conan Exiles requires its RCON plugin to be enabled before RSM can communicate with it.

1.  **First Run Required:** `Engine.ini`, `Game.ini`, and `ServerSettings.ini` do **not** exist until the server has been launched at least once -- Conan generates them itself on first startup. If you install via RSM's Forge wizard and immediately try to open **Edit Config**, you'll see a "Could not read file: ENOENT" placeholder for each tab -- that's expected, not a bug. Start the server once, let it fully boot, stop it cleanly, and the config files will exist for RSM (or you) to edit.
2.  **RCON Activation:** RCON settings live in **`Game.ini`**, not `Engine.ini` or `ServerSettings.ini`. Under a `[RconPlugin]` section, set:
    ```ini
    [RconPlugin]
    RconEnabled=1
    RconPassword=YourPasswordHere
    RconPort=25575
    ```
    You can also pass these as launch arguments (`-RconEnabled=1 -RconPassword=... -RconPort=25575`) instead of editing the file directly.
3.  **Firewall Rules:** Ensure your RCON Port (default `25575`) is open in your Windows Firewall.
4.  **File Location:** Locate these paths before starting the RSM Wizard:
    1.  __Server EXE:__ Usually located at `...\ConanSandbox\Binaries\Win64\ConanSandboxServer-Win64-Shipping.exe`
    2.  __Working Directory:__ The install root containing `ConanSandbox`.
    3.  __Config Files:__ `Engine.ini`, `Game.ini`, and `ServerSettings.ini`, under `ConanSandbox\Saved\Config\WindowsServer`.
    4.  __Log Folder:__ `ConanSandbox\Saved\Logs`. **Required for console output** -- Conan Exiles is a PowerShell-bridge game, so RSM tails this folder for the log panel rather than reading stdout directly. Without a Log Path set, the Console tab will stay empty even while the server is running fine. Make sure `-log` is in your Arguments (it's included by default in RSM's preset).
    5.  __RCON Port:__ Default is `25575`, set via `RconPort` under `[RconPlugin]` in `Game.ini`.
    6.  __RCON Password:__ The password set via `RconPassword` in the same section -- separate from the server's `AdminPassword`.

---

## ⚙️ Startup Arguments {: .rsm-header }

When using the Conan Exiles preset in RSM, your **Arguments** field should look similar to this:

| Flag | Function |
| :--- | :--- |
| `/Game/Maps/ConanSandbox/ConanSandbox` | The map to load. |
| `-log` | Enables console/log output. |
| `-Port=7777` | The game connection port. |

RCON is configured separately in `Game.ini` rather than as a launch flag (unless you're passing `-RconEnabled`/`-RconPassword`/`-RconPort` explicitly). RSM's config editor can parse an existing `Game.ini` and auto-fill the RCON port and password when adding an existing install.

---

## 🚀 Adding to RSM {: .rsm-header }

1.  **Open Manager:** Click **Add Server** and select the **Conan Exiles** card.
2.  **Fill Fields:** Paste your `ConanSandboxServer-Win64-Shipping.exe` path. RSM will attempt to auto-fill the Working Directory for you.
3.  **Verify RCON:** Double-check that the `RCON Port` and `RCON Password` in RSM match `Game.ini`'s `[RconPlugin]` section -- not `ServerSettings.ini`'s admin password, which is a separate credential.
4.  **Set the Log Path:** Point RSM at `...\ConanSandbox\Saved\Logs`. If you're adding an existing install with the config files already parsed, RSM auto-fills this for you; for a fresh install via the wizard, it's pre-filled based on the install location.
5.  **Save & Start:** Once saved, hit **Start**.
    * *Note: the Logs folder won't exist until the server has run at least once (see Pre-Configuration Steps above) -- the console will stay empty on the very first launch until that folder is created.*

---

## 🔍 Troubleshooting {: .rsm-header }

* **Console is empty:** Confirm `-log` is in your Arguments (included by default in RSM's preset) and that the **Log Path** field points to `ConanSandbox\Saved\Logs`. Conan Exiles is a PowerShell-bridge game -- RSM reads console output from this log folder, not from the process directly.
* **Commands don't work / player count stays blank:** Verify the RCON password in RSM matches `RconPassword` in `Game.ini` -- not the server's general `AdminPassword`, which is a different setting entirely.
* **RCON port looks right but nothing responds:** Confirm `RconEnabled=1` is actually set in `Game.ini`. RCON is off by default.
* **"Save World" Quick Action does nothing:** This command is carried over from RSM's Ark preset and hasn't been confirmed as a real Conan Exiles RCON command. If it doesn't do anything for you, that's expected for now -- `listplayers` is the one confirmed working command.

---

<p align="center">
  <i><b>Note:</b> Conan Exiles' RCON implementation is a third-party-style plugin bundled with the dedicated server, not a native Unreal Engine feature -- command availability can vary slightly by server build. Send <code>help</code> via RCON to see the full command list for your version.</i>
</p>
