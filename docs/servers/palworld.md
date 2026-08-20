# :material-paw: Palworld {: .rsm-header }

!!! abstract "REST API & PowerShell Integration"
    Palworld runs as a persistent Windows process. RSM uses a **PowerShell Bridge** to launch and track it, and Palworld's **REST API** for player count and admin queries.

!!! warning "RCON is deprecated -- RSM uses the REST API instead"
    Palworld's developers have officially deprecated RCON and stated it is scheduled to stop working in a future update, recommending the REST API as the replacement. RSM's player-count feature talks to the REST API directly, not RCON -- the **REST API Port** and **Admin Password** fields in RSM are for that API (default port `8212`), not the older RCON port (`25575`, still listed in Firewall Ports for reference if you use an external RCON tool, but RSM itself doesn't touch it).

!!! danger "Console output is not available for Palworld"
    Palworld does not write a log file by default -- there's no `Pal\Saved\Logs` folder unless something external creates one. Since RSM is a PowerShell-bridge game (it tails a log file for console output, it doesn't read stdout directly), there is currently no supported way to see live Palworld console output inside RSM. Player count, start/stop, and firewall management all work normally; only the live console text does not. If you need it, community wrapper scripts exist that redirect `PalServer.exe`'s output to a file RSM's Log Path field could then point to, but this isn't something RSM sets up for you.

---

## ⚠️ Pre-Configuration Steps {: .rsm-header }

Palworld requires the REST API to be enabled before RSM can show a player count.

1.  **Enable the REST API:** In `PalWorldSettings.ini`, set:
    ```ini
    RESTAPIEnabled=True
    RESTAPIPort=8212
    AdminPassword="YourPasswordHere"
    ```
    `AdminPassword` is shared between RCON and the REST API -- whatever you set here is what RSM uses to authenticate.
2.  **Firewall Rules:** Ensure the REST API port (default `8212`) is open in your Windows Firewall.
3.  **File Location:** Locate these paths before starting the RSM Wizard:
    1.  __Server EXE:__ Usually located at `...\PalServer.exe` (directly in the install root, not a subfolder).
    2.  __Working Directory:__ The install root containing `PalServer.exe` and the `Pal` folder.
    3.  __Config File:__ `PalWorldSettings.ini`, under `Pal\Saved\Config\WindowsServer`.
    4.  __REST API Port:__ Default is `8212`, set via `RESTAPIPort` in `PalWorldSettings.ini`.
    5.  __Admin Password:__ The password set via `AdminPassword` in the same file.

!!! info "Config file first-run behavior"
    Like most Unreal Engine dedicated servers, `PalWorldSettings.ini` may not exist until the server has been run at least once. If **Edit Config** shows "Could not read file: ENOENT" right after installing, start the server once and it should generate.

---

## ⚙️ Startup Arguments {: .rsm-header }

When using the Palworld preset in RSM, your **Arguments** field should look similar to this:

| Flag | Function |
| :--- | :--- |
| `EpicApp=PalServer` | Required launch identifier for the Epic Games build of the server. |
| `-port=8211` | The game connection port. |
| `-RCONPort=25575` | Sets the (deprecated) RCON port. Harmless to leave in even though RSM doesn't use it. |

REST API settings (`RESTAPIEnabled`, `RESTAPIPort`) are configured in `PalWorldSettings.ini`, not as launch flags. RSM's config editor can parse an existing `PalWorldSettings.ini` and auto-fill the REST API port and password when adding an existing install.

---

## 🚀 Adding to RSM {: .rsm-header }

1.  **Open Manager:** Click **Add Server** and select the **Palworld** card.
2.  **Fill Fields:** Paste your `PalServer.exe` path. RSM will attempt to auto-fill the Working Directory for you.
3.  **Verify REST API:** Double-check that the `REST API Port` and `Admin Password` in RSM match `RESTAPIEnabled`/`RESTAPIPort`/`AdminPassword` in `PalWorldSettings.ini`.
4.  **Save & Start:** Once saved, hit **Start**.
    * *Note: remember that console output won't appear regardless of configuration -- see the warning above. This is a Palworld limitation, not a missed setting.*

---

## 🔍 Troubleshooting {: .rsm-header }

* **Player count stays blank:** Confirm `RESTAPIEnabled=True` is actually set in `PalWorldSettings.ini` -- it's off by default. Also verify the `Admin Password` in RSM matches `AdminPassword` exactly.
* **Player count worked before, now doesn't:** If Palworld removes RCON in a future update this shouldn't affect you (RSM already uses the REST API), but if Pocketpair changes the REST API itself, check for an RSM update.
* **No console output:** Expected -- see the warning above. This isn't fixable from RSM's settings.

---

<p align="center">
  <i><b>Note:</b> Pocketpair's own documentation warns the REST API was not designed to be exposed to the internet -- keep the REST API port closed to anything outside your local network.</i>
</p>
