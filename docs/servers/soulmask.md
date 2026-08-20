# :material-drama-masks: Soulmask {: .rsm-header }

!!! abstract "PowerShell Integration"
    Soulmask runs as a persistent Windows process. RSM uses a **PowerShell Bridge** to launch and track it, and the **RCON Protocol** for player count.

!!! danger "RCON was previously missing from this config entirely"
    Soulmask genuinely supports RCON (`List_OnlinePlayers`, confirmed via multiple hosting guides), but earlier versions of this config never exposed the Port/Password fields at all -- so there was no way to configure it through RSM even though the game supports it. That's fixed now; the fields are visible and RSM's preset arguments enable RCON by default.

---

## ⚠️ Pre-Configuration Steps {: .rsm-header }

1.  **RCON Activation:** Soulmask uses launch flags, not a config-file section, for RCON:
    ```
    -rconpsw="YourPasswordHere" -rconaddr=0.0.0.0 -rconport=19000
    ```
    `-rconaddr=0.0.0.0` binds to all interfaces (needed for RSM, which connects locally, and any external tool); use `127.0.0.1` instead if you only ever want local access.
2.  **Firewall Rules:** Ensure your RCON Port (default `19000`) is open in your Windows Firewall.
3.  **File Location:** Locate these before starting the RSM Wizard:
    1.  __Server EXE:__ Usually located at `...\WS\Binaries\Win64\WSServer-Win64-Shipping.exe`.
    2.  __Working Directory:__ The install root containing the `WS` folder.
    3.  __RCON Port:__ Default is `19000`, set via `-rconport` in your Arguments.
    4.  __RCON Password:__ Set via `-rconpsw` in the same Arguments.
4.  No config file exists to auto-detect these from -- everything is set directly in the Arguments field, so fill in the Port/Password fields manually to match.

---

## ⚙️ Startup Arguments {: .rsm-header }

| Flag | Function |
| :--- | :--- |
| `/Game/Aki/Maps/RW_Aki?listen` | Map and listen-server flag. |
| `-Port=7777` | Game connection port. |
| `-QueryPort=27015` | Steam server browser query port. |
| `-MaxPlayers=40` | Player cap. |
| `-rconpsw="..."` | **Required for RCON.** RCON password. |
| `-rconaddr=0.0.0.0` | **Required for RCON.** Interface to bind RCON to. |
| `-rconport=19000` | RCON port RSM uses for player count. |

---

## 🚀 Adding to RSM {: .rsm-header }

1.  **Open Manager:** Click **Add Server** and select the **Soulmask** card.
2.  **Fill Fields:** Paste your `WSServer-Win64-Shipping.exe` path. RSM will attempt to auto-fill the Working Directory for you.
3.  **Set RCON Port/Password:** Enter these manually to match your Arguments -- there's no config file to auto-detect them from.
4.  **Save & Start:** Once saved, hit **Start**.

---

## 🔍 Troubleshooting {: .rsm-header }

* **Player count stays blank:** Confirm the RCON Port/Password in RSM exactly match `-rconport`/`-rconpsw` in your Arguments, and that `-rconaddr` isn't restricted to an address RSM can't reach (use `0.0.0.0` or `127.0.0.1`).
* **RCON connection refused:** Confirm all three `-rcon*` flags are actually present in your Arguments -- RCON is entirely off unless explicitly enabled.

---

<p align="center">
  <i><b>Note:</b> Soulmask's RCON binds to whatever interface <code>-rconaddr</code> specifies -- keep it restricted to <code>127.0.0.1</code> unless you specifically need external tools to reach it, and never expose the RCON port directly to the internet.</i>
</p>
