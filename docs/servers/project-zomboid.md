# :material-brain: Project Zomboid {: .rsm-header }

!!! abstract "Direct Console + RCON"
    Project Zomboid is unusual: RSM launches it as a **DIRECT_CONSOLE** process (a real stdin pipe, same as Minecraft -- Quick Actions use this), but it *also* runs a genuine Source RCON server on its own port, independent of how it was launched. RSM's player-count feature uses RCON directly for a clean, reliable answer instead of trying to parse the direct console's text output.

---

## ⚠️ Pre-Configuration Steps {: .rsm-header }

1.  **RCON Port/Password:** Set via launch arguments -- `-rcon.port 27015 -rcon.password "..."` (RSM's preset includes these by default, port `27015`).
2.  **Config Location:** Project Zomboid stores its actual settings in `%USERPROFILE%\Zomboid\Server\` (in the Windows user profile, **not** inside the server's install folder) after the first run -- RSM doesn't auto-detect this location, so there's no config file parsing for this game. Fill in the RCON Port/Password fields manually when adding the server.
3.  **File Location:** Locate these paths before starting the RSM Wizard:
    1.  __Server Batch File:__ Usually located at `...\ProjectZomboidServer.bat`, directly in the install root.
    2.  __Working Directory:__ The install root containing the batch file.
    3.  __RCON Port:__ Default is `27015`, set via `-rcon.port` in your Arguments.
    4.  __RCON Password:__ Set via `-rcon.password` in the same Arguments.

---

## ⚙️ Startup Arguments {: .rsm-header }

| Flag | Function |
| :--- | :--- |
| `-servername "pzserver"` | Server name / save folder identifier. |
| `-adminpassword "..."` | In-game admin password (separate from RCON). |
| `-port 16261` | Game connection port. |
| `-rcon.port 27015` | RCON port RSM uses for player count. |
| `-rcon.password "..."` | RCON password. |

---

## 🚀 Adding to RSM {: .rsm-header }

1.  **Open Manager:** Click **Add Server** and select the **Project Zomboid** card.
2.  **Fill Fields:** Paste your `ProjectZomboidServer.bat` path. RSM will attempt to auto-fill the Working Directory for you.
3.  **Set RCON Port/Password:** Enter these manually to match your Arguments -- there's no config file to auto-detect them from.
4.  **Save & Start:** Once saved, hit **Start**.

---

## 🔍 Troubleshooting {: .rsm-header }

* **Player count stays blank:** Confirm the RCON Port/Password you entered in RSM exactly match `-rcon.port`/`-rcon.password` in your Arguments.
* **Console is empty:** Project Zomboid's direct console can take a while to populate on first boot (world loading) -- give it a minute.
* **Quick Actions do nothing:** These go through the direct console pipe, not RCON -- confirm the server has fully finished loading first.

---

<p align="center">
  <i><b>Note:</b> Project Zomboid's actual per-server settings (sandbox options, spawn rates, etc.) live in the user profile, not the install folder -- edit them via <code>%USERPROFILE%\Zomboid\Server\&lt;servername&gt;.ini</code> directly, not through RSM's config editor.</i>
</p>
