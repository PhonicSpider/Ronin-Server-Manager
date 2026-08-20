# :material-pine-tree: Sons of the Forest {: .rsm-header }

!!! abstract "PowerShell Integration, Arguments Only"
    Sons of the Forest runs as a persistent Windows process. RSM uses a **PowerShell Bridge** to launch and track it. There's no config file at all -- every setting is a launch argument.

!!! warning "No RCON, no player count"
    Sons of the Forest does not support RCON -- there's no `RconPassword`/`RconPort` setting and no remote console protocol at all. Server administration works entirely through the dedicated server's own config (an owner/admin account list) and in-game tools. RSM cannot show a player count or send remote commands for this game -- that's a hard limitation of the game itself.

---

## ⚠️ Pre-Configuration Steps {: .rsm-header }

1.  **File Location:** Locate these before starting the RSM Wizard:
    1.  __Server EXE:__ Usually located at `...\SonsOfTheForestDS.exe`, directly in the install root.
    2.  __Working Directory:__ The install root containing `SonsOfTheForestDS.exe`.
2.  No config file exists to auto-detect settings from -- everything is set directly in the Arguments field.

---

## ⚙️ Startup Arguments {: .rsm-header }

| Flag | Function |
| :--- | :--- |
| `-serverip 0.0.0.0` | Bind address. |
| `-port 8766` | Game connection port. |
| `-queryport 27016` | Steam server browser query port. |
| `-blobsyncport 9700` | Used for save-file synchronization. |
| `-maxplayers 8` | Player cap. |
| `-name "My Server"` | Server name shown in the browser. |
| `-saveslot 1` | Which save slot to use. |

---

## 🚀 Adding to RSM {: .rsm-header }

1.  **Open Manager:** Click **Add Server** and select the **Sons of the Forest** card.
2.  **Fill Fields:** Paste your `SonsOfTheForestDS.exe` path. RSM will attempt to auto-fill the Working Directory for you.
3.  **Save & Start:** Once saved, hit **Start**.

---

## 🔍 Troubleshooting {: .rsm-header }

* **No player count / no Quick Actions:** Expected -- see the warning above. Not fixable from RSM's settings.
* **Server won't start:** Confirm the ports in your Arguments (`-port`, `-queryport`, `-blobsyncport`) aren't already in use by another instance.
* **Multiple instances conflict:** Each instance needs its own unique game/query/blob-sync ports and a distinct `-saveslot`.

---

<p align="center">
  <i><b>Note:</b> Admin access on Sons of the Forest is managed entirely in-game (via the "cheatstick" command and admin panel), not remotely -- there's nothing RSM can configure to change this.</i>
</p>
