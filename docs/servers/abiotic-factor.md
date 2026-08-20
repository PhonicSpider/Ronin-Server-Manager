# :material-flask: Abiotic Factor {: .rsm-header }

!!! abstract "PowerShell Integration, Arguments Only"
    Abiotic Factor runs as a persistent Windows process. RSM uses a **PowerShell Bridge** to launch and track it. There's no config file -- every setting is a launch argument.

!!! warning "No RCON, no console commands, no player count"
    Vanilla Abiotic Factor has no console commands at all -- admin moderation runs entirely through the in-game **Player Management UI** (Esc → Player Management → Admin tab), with access granted via `Admin.ini` or an `-AdminPassword` launch parameter. There is no tilde console, no RCON, and no remote command protocol. RSM cannot show a player count or send remote commands for this game -- that's a hard limitation of the game itself, confirmed against community server-hosting documentation.

---

## ⚠️ Pre-Configuration Steps {: .rsm-header }

1.  **Set the Admin Password:** Use `-AdminPassword=...` in your Arguments to grant yourself admin access in-game, where all moderation actually happens.
2.  **File Location:** Locate these before starting the RSM Wizard:
    1.  __Server EXE:__ Usually located at `...\AbioticFactor\Binaries\Win64\AbioticFactorServer-Win64-Shipping.exe`.
    2.  __Working Directory:__ The install root containing the `AbioticFactor` folder.
3.  No config file exists to auto-detect settings from -- everything is set directly in the Arguments field.

---

## ⚙️ Startup Arguments {: .rsm-header }

| Flag | Function |
| :--- | :--- |
| `/Game/AbioticFactor/Maps/AF_PersistentWorld?listen` | Map and listen-server flag. |
| `-Port=7777` | Game connection port. |
| `-MaxPlayers=6` | Player cap (Abiotic Factor's hard limit is small). |
| `-AdminPassword=...` | Grants admin access in-game -- this is the only form of "remote" administration available. |
| `-log` | Enables logging. |

---

## 🚀 Adding to RSM {: .rsm-header }

1.  **Open Manager:** Click **Add Server** and select the **Abiotic Factor** card.
2.  **Fill Fields:** Paste your `AbioticFactorServer-Win64-Shipping.exe` path. RSM will attempt to auto-fill the Working Directory for you.
3.  **Save & Start:** Once saved, hit **Start**.

---

## 🔍 Troubleshooting {: .rsm-header }

* **No player count / no Quick Actions:** Expected -- see the warning above. Not fixable from RSM's settings.
* **Can't access admin tools:** Confirm `-AdminPassword` is set in your Arguments and that you've entered the matching password in-game via the Player Management UI.
* **Server rejects more than 6 players:** This is Abiotic Factor's actual design limit, not an RSM setting.

---

<p align="center">
  <i><b>Note:</b> Community mods (UE4SS-based) can add a real console with cheat/spawn commands, but that requires an extra launch argument and modding the server itself -- outside anything RSM configures for you.</i>
</p>
