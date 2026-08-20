# :material-zombie: 7 Days to Die {: .rsm-header }

!!! abstract "Direct Console Integration"
    7 Days to Die runs with a real console attached -- RSM launches it as a **DIRECT_CONSOLE** process and reads/writes its stdin/stdout directly, the same way it does for Minecraft. There's also a separate Telnet-based remote console (port 8081 by default), useful for external tools, but RSM's own console tab and Quick Actions go through the direct process pipe, not Telnet.

!!! abstract "Player count via stdin"
    RSM sends `listplayers` over the same stdin pipe Quick Actions use, then parses the response's summary line (the one ending in "in the game") out of the console output to update the player count badge.

---

## ⚠️ Pre-Configuration Steps {: .rsm-header }

1.  **Telnet Activation (optional, for external tools):** Set `TelnetEnabled` to `true` in `serverconfig.xml`, along with `TelnetPort` (default `8081`) and `TelnetPassword`. RSM records these for firewall/reference purposes even though its own commands go through the direct console instead.
2.  **File Location:** Locate these paths before starting the RSM Wizard:
    1.  __Server EXE:__ Usually located at `...\7DaysToDieServer.exe`, directly in the install root.
    2.  __Working Directory:__ The install root containing `7DaysToDieServer.exe`.
    3.  __Config File:__ `serverconfig.xml`, directly in the install root.
    4.  __Telnet Port/Password:__ Default port `8081`, set in `serverconfig.xml`.

---

## ⚙️ Startup Arguments {: .rsm-header }

| Flag | Function |
| :--- | :--- |
| `-configfile="serverconfig.xml"` | Points at your config file. |
| `-logfile "output_log.txt"` | Log output destination (informational for 7DTD's own use -- RSM reads console via the direct process pipe, not this file). |
| `-quit -batchmode -nographics -dedicated` | Standard headless dedicated-server flags. |

RSM's config editor can parse an existing `serverconfig.xml` and auto-fill the Telnet port/password when adding an existing install.

---

## 🚀 Adding to RSM {: .rsm-header }

1.  **Open Manager:** Click **Add Server** and select the **7 Days to Die** card.
2.  **Fill Fields:** Paste your `7DaysToDieServer.exe` path. RSM will attempt to auto-fill the Working Directory for you.
3.  **Save & Start:** Once saved, hit **Start**.

---

## 🔍 Troubleshooting {: .rsm-header }

* **Console is empty:** Confirm the server isn't opening its own separate console window instead of writing to the pipe RSM reads -- check that you haven't added flags that force a visible window.
* **Player count never updates:** RSM's parser looks for a line containing "in the game" in the console output -- confirm `listplayers` is producing normal output (check the Console tab after a manual "List Players" Quick Action) and that nothing is suppressing console output for this server.
* **Save/shutdown seems to hang:** 7 Days to Die can take a while to write its save on a large map -- give it time before assuming it's frozen.

---

<p align="center">
  <i><b>Note:</b> If you need Telnet-based remote access from outside RSM (e.g. a Discord bot), the port/password RSM stores are ready to use with any Telnet-speaking tool.</i>
</p>
