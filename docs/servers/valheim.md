# :material-axe-battle: Valheim {: .rsm-header }

!!! abstract "PowerShell Integration"
    Valheim runs as a persistent Windows process. RSM uses a **PowerShell Bridge** to launch and track it, and tails a log file on disk for console output.

!!! warning "No player count -- Valheim has no RCON"
    Valheim ships with no native RCON. The only way to see connected players is the in-game F2 overlay, which RSM has no access to. (A community BepInEx mod, ValheimRcon, can add RCON support, but that's outside what RSM configures for you.) Start/stop, console log, config, and firewall management all work normally -- only player count is unavailable, and that's a game limitation, not a missing setting.

---

## ⚠️ Pre-Configuration Steps {: .rsm-header }

1.  **Enable Logging:** Valheim writes nothing to disk unless told to. Add `-logFile "path\to\log.txt"` to your Arguments (note the capital `F` -- unlike most other games' `-logfile`). RSM's preset includes this by default. Without it, the Console tab stays empty even while the server runs fine.
2.  **File Location:** Valheim has no config file -- everything is a launch argument. Locate these before starting the RSM Wizard:
    1.  __Server EXE:__ Usually located at `...\valheim_server.exe`, directly in the install root.
    2.  __Working Directory:__ The install root containing `valheim_server.exe`.
    3.  __Log File:__ Wherever you pointed `-logFile` -- RSM's preset uses `logs\valheim_server.log` inside the install directory.

---

## ⚙️ Startup Arguments {: .rsm-header }

| Flag | Function |
| :--- | :--- |
| `-name "My Server"` | Server name shown in the server browser. |
| `-port 2456` | Game port. Valheim also needs the two ports above it (2457, 2458) open. |
| `-world "Dedicated"` | World save name. |
| `-password "..."` | Join password (10+ characters, required by Valheim). |
| `-public 1` | Lists the server in the public browser. Use `0` for private/whitelist-only. |
| `-logFile "..."` | **Required for console output.** Valheim writes nothing to disk without this. |

---

## 🚀 Adding to RSM {: .rsm-header }

1.  **Open Manager:** Click **Add Server** and select the **Valheim** card.
2.  **Fill Fields:** Paste your `valheim_server.exe` path. RSM will attempt to auto-fill the Working Directory for you.
3.  **Set the Log Path:** Point RSM at your `-logFile` destination.
4.  **Save & Start:** Once saved, hit **Start**.

---

## 🔍 Troubleshooting {: .rsm-header }

* **Console is empty:** Confirm `-logFile` (capital F) is in your Arguments and matches RSM's **Log Path** field exactly.
* **Player count never shows:** Expected -- see the warning above. Valheim has no RCON to query.
* **Server rejects the password:** Valheim requires passwords to be at least 5 characters and not contained in the server name.

---

<p align="center">
  <i><b>Note:</b> Valheim's logs are notably sparse compared to other dedicated servers -- don't expect the same level of detail you'd see from an Ark or Conan Exiles log.</i>
</p>
