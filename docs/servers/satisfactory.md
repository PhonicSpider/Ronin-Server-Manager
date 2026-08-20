# :material-factory: Satisfactory {: .rsm-header }

!!! abstract "PowerShell Integration, In-Game Configuration"
    Satisfactory runs as a persistent Windows process. RSM uses a **PowerShell Bridge** to launch and track it. Most settings are configured in-game after connecting, not via a config file or launch arguments.

!!! abstract "Player count via HTTPS API"
    RSM queries Satisfactory's HTTPS API for player count -- a two-step flow: log in first (with your password, or passwordless if the server allows insecure local access) to get a bearer token, then query server state with that token. The server's self-signed TLS certificate is accepted automatically; you don't need to do anything special about it.

!!! danger "Corrected: the API port is the same as the game port"
    An earlier version of this config incorrectly listed a separate "Manager Port" (7778). Satisfactory's HTTPS API actually runs on the **same port number as the game itself** (`7777` by default) -- confirmed against the official Satisfactory wiki. If you previously opened a firewall rule for 7778 thinking it was needed for the API, it wasn't; only the game port needs to be open.

---

## ⚠️ Pre-Configuration Steps {: .rsm-header }

1.  **File Location:** Locate these before starting the RSM Wizard:
    1.  __Server EXE:__ Usually located at `...\Engine\Binaries\Win64\UnrealServer-Win64-Shipping.exe`.
    2.  __Working Directory:__ The install root containing `Engine`.
    3.  __Port:__ Default is `7777` -- used for both the game connection and the HTTPS API.
    4.  __Password:__ The server's admin/client password, set in-game. Leave RSM's password field blank only if you've enabled `FG.DedicatedServer.AllowInsecureLocalAccess=1` on the server -- otherwise RSM's login call will fail and player count will show blank.
2.  Most server settings (session name, admin password, game rules) are configured through the in-game server manager UI after first connecting, not through a file RSM can parse ahead of time.

---

## ⚙️ Startup Arguments {: .rsm-header }

| Flag | Function |
| :--- | :--- |
| `FactoryGame` | Required launch identifier. |
| `-log` | Enables logging. |
| `-NoSteamClient` | Runs without requiring a local Steam client. |
| `-unattended` | Skips interactive prompts, needed for a true dedicated/headless server. |
| `-Port=7777` | Game connection port -- also serves the HTTPS API on this same port. |

---

## 🚀 Adding to RSM {: .rsm-header }

1.  **Open Manager:** Click **Add Server** and select the **Satisfactory** card.
2.  **Fill Fields:** Paste your `UnrealServer-Win64-Shipping.exe` path. RSM will attempt to auto-fill the Working Directory for you.
3.  **Save & Start:** Once saved, hit **Start**.
4.  **Finish Setup In-Game:** Connect and complete server configuration (session name, password, game rules) through Satisfactory's own server manager UI.

---

## 🔍 Troubleshooting {: .rsm-header }

* **Player count doesn't show:** Almost always an auth mismatch. Confirm the password in RSM matches the server's actual admin/client password, or that you've explicitly enabled `FG.DedicatedServer.AllowInsecureLocalAccess=1` if you're leaving the password blank.
* **Opened port 7778 but it didn't help:** That port isn't used by this game's API -- see the correction above. Only the game port (`7777` by default) needs to be open.
* **Server appears to hang on "unattended" startup:** Give it a minute -- the first boot after install can take a while to finish initializing before it's joinable.

---

<p align="center">
  <i><b>Note:</b> Satisfactory's official documentation notes a real quirk here -- the passwordless and password-based login calls return the token under differently-cased field names (<code>authenticationToken</code> vs <code>AuthenticationToken</code>). RSM checks both, but if you're scripting against this API yourself, watch for it.</i>
</p>
