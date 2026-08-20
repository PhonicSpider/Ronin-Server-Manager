# :material-paw: Ark: Survival Ascended {: .rsm-header }

!!! abstract "RCON & PowerShell Integration"
    Ark: Survival Ascended runs as a persistent Windows process. Because it does not stream its console output to a standard window, RSM uses a **PowerShell Bridge** to tail the latest log files and the **RCON Protocol** (unchanged from Ark: Survival Evolved) to send administrative commands like kicks, bans, and broadcasts.

!!! note "Not the same server as Ark: Survival Evolved"
    Survival Ascended is a separate Steam app (`2430930`) with its own executable, `ArkAscendedServer.exe`, and its own install folder. If you're running the original Ark: Survival Evolved, use the [Ark: Survival Evolved guide](ark-survival.md) instead -- the two are not interchangeable in RSM.

---

## ⚠️ Pre-Configuration Steps {: .rsm-header }

Ascended requires specific launch flags to be active before RSM can communicate with it via RCON.

1.  **First Run Required:** `GameUserSettings.ini` and `Game.ini` do **not** exist until the server has been started and *gracefully* stopped at least once -- Ascended writes them on shutdown, not startup. If you install via RSM's Forge wizard and immediately try to open **Edit Config**, you'll see a "Could not read file: ENOENT" placeholder -- that's expected. Start the server, let it fully boot, then stop it cleanly (not Force Kill) so it actually writes the files to disk.
2.  **RCON Activation:** Ensure `RCONEnabled=True` is set (either via `?RCONEnabled=True` in the map string, or in `GameUserSettings.ini` under `[ServerSettings]`). Without this, the Console tab in RSM will be "Read-Only."
3.  **Firewall Rules:** Ensure your RCON Port (default `27020`) is open in your Windows Firewall. RSM connects to this port locally to execute commands.
4.  **File Location:** Locate these paths before starting the RSM Wizard:
    1.  __Server EXE:__ Usually located at `...\ShooterGame\Binaries\Win64\ArkAscendedServer.exe`
    2.  __Working Directory:__ The install root containing `ShooterGame`.
    3.  __Config Files:__ `GameUserSettings.ini` and `Game.ini`, under `ShooterGame\Saved\Config\WindowsServer`.
    4.  __Log Folder:__ `ShooterGame\Saved\Logs`. **Required for console output** -- Ascended is a PowerShell-bridge game, so RSM tails this folder for the log panel rather than reading stdout directly. Without a Log Path set, the Console tab will stay empty even while the server is running fine. Make sure `-log` is in your Arguments (it's included by default in RSM's preset).
    5.  __RCON Port:__ Default is `27020`, set via `RCONPort=27020` under `[ServerSettings]` in `GameUserSettings.ini`.
    6.  __Admin Password:__ The password set via `ServerAdminPassword` in the same section.

---

## ⚙️ Startup Arguments {: .rsm-header }

When using the Ark: Survival Ascended preset in RSM, your **Arguments** field should look similar to this:

| Flag | Function |
| :--- | :--- |
| `TheIsland_WP?listen` | Sets the map and starts the listener. Note the `_WP` suffix -- Ascended's map names differ from Evolved's. |
| `?RCONEnabled=True` | **Required.** Opens the RCON communication channel. |
| `?RCONPort=27020` | Defines the port RSM uses to send commands. |
| `?ServerAdminPassword=...` | Sets the credentials for RSM to log in. |
| `-server -log` | Standard dedicated-server flags. |

RSM's config editor can also parse an existing `GameUserSettings.ini` and auto-fill the RCON port and admin password when you add an existing install rather than a fresh one.

---

## 🚀 Adding to RSM {: .rsm-header }

1.  **Open Manager:** Click **Add Server** and select the **Ark: Survival Ascended** card.
2.  **Fill Fields:** Paste your `ArkAscendedServer.exe` path. RSM will attempt to auto-fill the Working Directory for you.
3.  **Verify RCON:** Double-check that the `RCON Port` and `Admin Password` in RSM match `GameUserSettings.ini`.
4.  **Set the Log Path:** Point RSM at `...\ShooterGame\Saved\Logs`. If you're adding an existing install with the config files already parsed, RSM auto-fills this for you; for a fresh install via the wizard, it's pre-filled based on the install location.
5.  **Save & Start:** Once saved, hit **Start**.
    * *Note: Ascended servers can take a minute or more to finish loading on first start. If Quick Actions or the player count don't respond right away, give it time before assuming something's wrong. The Logs folder also won't exist until the server has run once -- the console will stay empty on the very first launch until it's created.*

---

## 🔍 Troubleshooting {: .rsm-header }

* **Console is empty:** Confirm `-log` is in your Arguments (included by default in RSM's preset) and that the **Log Path** field points to `ShooterGame\Saved\Logs`. Ascended is a PowerShell-bridge game -- RSM reads console output from this log folder, not from the process directly.
* **Commands don't work / player count stays blank:** Verify the `Admin Password` in RSM matches `ServerAdminPassword` exactly, and that the RCON port isn't blocked by a firewall or antivirus.
* **Server won't start:** Confirm the Working Directory points to the folder containing `ShooterGame`, not a subfolder inside it.
* **Wrong exe selected:** Ascended's server binary is `ArkAscendedServer.exe` -- if you accidentally pointed RSM at `ShooterGameServer.exe` (Evolved's binary) it won't launch correctly even if the path resolves.

---

<p align="center">
  <i><b>Note:</b> RCON on Ascended uses the same Source RCON protocol as Evolved, so any external RCON tool that worked with your old Ark server will also work here.</i>
</p>
