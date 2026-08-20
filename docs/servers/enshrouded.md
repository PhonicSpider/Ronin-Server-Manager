# :material-weather-fog: Enshrouded {: .rsm-header }

!!! abstract "PowerShell Integration, Config-File Only"
    Enshrouded runs as a persistent Windows process. RSM uses a **PowerShell Bridge** to launch and track it. There are no launch arguments to speak of -- everything is configured through `enshrouded_server.json`.

!!! warning "No RCON, no console commands, no player count"
    Enshrouded ships with **no developer console, no chat commands, and no RCON** on either the client or the dedicated server -- confirmed against community server-hosting documentation. Everything an admin controls lives in `enshrouded_server.json` and the in-game player list (kick/ban happen there). RSM cannot show a player count or send remote commands for this game -- that's a hard limitation of Enshrouded itself, not a missing RSM feature or a misconfiguration.

---

## ⚠️ Pre-Configuration Steps {: .rsm-header }

1.  **Configure via JSON, not Arguments:** Server name, password, port, and max players are all set inside `enshrouded_server.json`. RSM's Arguments field is intentionally hidden for this game since there's nothing to put there.
2.  **File Location:** Locate these before starting the RSM Wizard:
    1.  __Server EXE:__ Usually located at `...\enshrouded_server.exe`, directly in the install root.
    2.  __Working Directory:__ The install root containing `enshrouded_server.exe`.
    3.  __Config File:__ `enshrouded_server.json`, directly in the install root.
3.  **First Run Required:** Like most Unreal-family servers, `enshrouded_server.json` may not exist with real values until the server has been run at least once. If **Edit Config** looks empty or unexpected right after installing, start the server once first.

---

## 🚀 Adding to RSM {: .rsm-header }

1.  **Open Manager:** Click **Add Server** and select the **Enshrouded** card.
2.  **Fill Fields:** Paste your `enshrouded_server.exe` path. RSM will attempt to auto-fill the Working Directory for you.
3.  **Review the Config Tab:** Check `enshrouded_server.json` for the game port and password RSM auto-detected.
4.  **Save & Start:** Once saved, hit **Start**.

---

## 🔍 Troubleshooting {: .rsm-header }

* **No player count / no Quick Actions:** Expected -- see the warning above. Not fixable from RSM's settings; Enshrouded simply doesn't expose this remotely.
* **Config values look wrong:** Confirm the server has actually run at least once so `enshrouded_server.json` has real values, not just the game's own defaults.
* **Can't kick/ban remotely:** Use the in-game player list as an admin -- Enshrouded has no remote moderation path outside the game itself.

---

<p align="center">
  <i><b>Note:</b> If you need remote administration beyond what's possible here, that would require a community-made proxy or plugin -- nothing built into Enshrouded or RSM supports it today.</i>
</p>
