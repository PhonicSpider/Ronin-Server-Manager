# :material-bat: V Rising {: .rsm-header }

!!! abstract "PowerShell Integration"
    V Rising runs as a persistent Windows process with no interactive console of its own. RSM uses a **PowerShell Bridge** to launch and track it, and tails a log file on disk for console output.

!!! warning "RCON exists, but has no player-list command"
    V Rising's RCON is a deliberately small, server-management-only command set: `announce`, `shutdown`, `cancelshutdown`, `name`, `description`, `password`, `version`, `time`, and `help`. There is **no** command to list connected players over RCON. Player listing (`listusers`) only works through the in-game console after `adminauth`, which RSM has no access to -- so RSM cannot show a player count for V Rising. Everything else (start/stop, console log, RCON-based commands you send manually, firewall) works normally.

---

## ⚠️ Pre-Configuration Steps {: .rsm-header }

V Rising needs explicit flags to enable both logging and RCON -- neither is on by default.

1.  **Enable Logging:** V Rising does **not** write a log file unless told to. Add `-logFile ".\logs\VRisingServer.log"` to your Arguments (RSM's preset includes this by default). Without it, the Console tab in RSM will stay empty even while the server runs fine.
2.  **RCON Activation:** Add `-rconEnabled -rconPort 25575` to your Arguments, or set it directly in `ServerHostSettings.json` under the `Rcon` section:
    ```json
    "Rcon": {
      "Enabled": true,
      "Port": 25575,
      "Password": "YourPasswordHere"
    }
    ```
3.  **Firewall Rules:** Ensure your RCON Port (default `25575`) is open in your Windows Firewall.
4.  **File Location:** Locate these paths before starting the RSM Wizard:
    1.  __Server EXE:__ Usually located at `...\VRisingServer.exe`, directly in the install root.
    2.  __Working Directory:__ The install root containing `VRisingServer.exe` and `VRisingServer_Data`.
    3.  __Config Files:__ `ServerHostSettings.json` and `ServerGameSettings.json`, under `VRisingServer_Data\StreamingAssets\Settings`.
    4.  __Log File:__ Wherever you pointed `-logFile` -- RSM's preset uses `logs\VRisingServer.log` inside the install directory.
    5.  __RCON Port:__ Default is `25575`, set via `Rcon.Port` in `ServerHostSettings.json`.
    6.  __RCON Password:__ The password set via `Rcon.Password` in the same section.

---

## ⚙️ Startup Arguments {: .rsm-header }

When using the V Rising preset in RSM, your **Arguments** field should look similar to this:

| Flag | Function |
| :--- | :--- |
| `-persistentDataPath "..."` | Where save data is stored. RSM fills this with the install directory. |
| `-serverPort 9876` | The game connection port. |
| `-rconEnabled` | **Required for RCON.** Off by default. |
| `-rconPort 25575` | Defines the RCON port. |
| `-logFile "...\logs\VRisingServer.log"` | **Required for console output.** V Rising writes nothing to disk without this. |

RSM's config editor can parse an existing `ServerHostSettings.json` and auto-fill the RCON port and password when adding an existing install.

---

## 🚀 Adding to RSM {: .rsm-header }

1.  **Open Manager:** Click **Add Server** and select the **V Rising** card.
2.  **Fill Fields:** Paste your `VRisingServer.exe` path. RSM will attempt to auto-fill the Working Directory for you.
3.  **Verify RCON:** Double-check that the `RCON Port` and `RCON Password` in RSM match `ServerHostSettings.json`'s `Rcon` section.
4.  **Set the Log Path:** Point RSM at `...\logs\VRisingServer.log` (a specific file, not a folder -- V Rising logs to one file per the `-logFile` argument). If you're adding an existing install with config already parsed, RSM auto-fills this for you.
5.  **Save & Start:** Once saved, hit **Start**.

---

## 🔍 Troubleshooting {: .rsm-header }

* **Console is empty:** Confirm `-logFile` is in your Arguments and points to the same path as RSM's **Log Path** field. Unlike Ark or Conan Exiles, V Rising never creates a log file on its own -- the flag is mandatory, not just a nice-to-have.
* **Player count never shows:** This is expected -- see the warning above. V Rising's RCON has no player-list command, so RSM has no way to query this. It's a game limitation, not a missing setting.
* **RCON commands do nothing:** Confirm `-rconEnabled` is in your Arguments (or `Rcon.Enabled: true` in `ServerHostSettings.json`) and that the port/password in RSM match exactly.

---

<p align="center">
  <i><b>Note:</b> V Rising's RCON command set is intentionally minimal -- it's meant for server administration (announcements, scheduled shutdowns), not gameplay or player-data queries.</i>
</p>
