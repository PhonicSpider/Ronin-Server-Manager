# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🏗️ Server Setup Overview</p>

Adding a server to **Ronin Server Manager** takes just a few minutes. Click **+ Add New Server** in the sidebar, pick your game type from the card grid, fill in the paths the wizard asks for, and hit **Save Configuration**. RSM will handle the rest.

The fields shown in the wizard depend on the game — not every server needs every field. This guide explains what each one means and what to look for before you start.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">⚠️ Prerequisite: The "First Run"</p>

Before adding a server to RSM, make sure it has been launched at least once **manually** and starts without errors. RSM needs a working server installation to manage — it does not install, update, or configure the game for you.

<div class="grid cards" markdown>

-   :material-play-circle: **Run Once Manually**

    ---

    Double-click your `.bat`, `.exe`, or launch script to verify the server starts and reaches a ready state before linking it to RSM.

-   :material-folder-cog: **Know Your Paths**

    ---

    Note the full path to your server executable **and** the folder it lives in. Both are usually required. Paths with spaces must be wrapped in double quotes when used in arguments.

-   :material-puzzle: **Install Mods First**

    ---

    If your server uses mods or plugins, install them and confirm they load before adding the server to RSM. RSM launches the server exactly as configured — no extra steps happen on its behalf.

-   :material-file-check: **Accept Any EULAs**

    ---

    Accept any end-user license agreements the game requires (e.g. Minecraft's `eula.txt`) before your first managed launch. Servers that require EULA acceptance will exit immediately if it hasn't been done.

-   :material-wall: **Open Firewall Ports**

    ---

    Open the game's required ports in Windows Firewall (e.g. `25565` for Minecraft, `7777` for Terraria, `27015`/`27020` for Ark). RSM does not modify firewall rules.

-   :material-ip-outline: **Configure RCON / API Access**

    ---

    For games that support remote commands (Ark, Space Engineers), enable and note your RCON port and password in the server's config file **before** adding it. RSM uses this for sending console commands and reading player counts.

</div>

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">📋 Wizard Fields — What Goes Where</p>

The **Add Server** wizard shows only the fields relevant to each game type. Here's what each one means:

| Field | What to Enter |
|---|---|
| **Display Name** | A friendly label shown in the sidebar — e.g. `Minecraft Survival Hub` |
| **Executable Path** | Full path to the `.exe`, `.jar`, or `java.exe` that launches your server |
| **Working Directory** | The root folder of your server installation — where `server.properties`, world folders, etc. live |
| **Log File / Folder Path** | Path to the folder that contains your server's `.log` files (used by SE and Ark for console output) |
| **Port** | RCON port (Ark) or VRage HTTP API port (Space Engineers) — needed for remote commands and player counts |
| **Password** | RCON password (Ark) or VRage API password (Space Engineers) |
| **Launch Arguments** | Command-line flags passed to the executable on startup — pre-filled with a working default for known game types |

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🎮 Select Your Game Engine</p>

Pick your game below for specific pathing requirements and startup arguments.

<div class="grid cards" markdown>

-   :material-minecraft: **Minecraft (Java)**

    ---
    Launched directly via `java.exe`. Requires the **Executable Path** (java), **Working Directory** (server folder), and **Launch Arguments** (`-jar server.jar`). No log path or RCON needed.

    **Config Editor:** `server.properties`, `ops.json`

    [:octicons-arrow-right-24: View Guide](minecraft.md)

-   :material-rocket-launch: **Space Engineers**

    ---
    Native Windows binary via PowerShell bridge. Requires all fields including **Log Folder** and **VRage API Port / Password** for remote commands. Needs Admin rights for network binding.

    **Config Editor:** `SpaceEngineers-Dedicated.cfg`

    [:octicons-arrow-right-24: View Guide](space-engineers.md)

-   :material-axe: **Ark: Survival Evolved**

    ---
    SteamCMD binary via PowerShell bridge. Requires all fields. RCON must be enabled in `GameUserSettings.ini` before adding. Config files live in a subfolder of the install.

    **Config Editor:** `GameUserSettings.ini`, `Game.ini`

    [:octicons-arrow-right-24: View Guide](ark-survival.md)

-   :material-sword: **Terraria**

    ---
    Launched directly via `TerrariaServer.exe`. Requires **Executable Path**, **Working Directory**, and **Launch Arguments** (world, port, player count). No log path or RCON needed.

    **Config Editor:** `serverconfig.txt`

    [:octicons-arrow-right-24: View Guide](terraria.md)

-   :material-wrench: **Custom / Other**

    ---
    Generic setup for any game not listed above. All fields are shown — fill in only what your server actually needs. Uses `DIRECT_CONSOLE` mode by default.

    [:octicons-arrow-right-24: View Troubleshooting](#troubleshooting-paths)

</div>

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">✏️ Config Editor</p>

Once a server is added, RSM can open its config files directly in the app. Click the **Edit Config** button in the server's control bar to open the in-app editor.

- **Tabs** appear at the top when a game has more than one config file.
- **Line numbers** are shown on the left for easy reference.
- A **warning banner** appears at the top if the server is currently running — changes will take effect after the next restart.
- Use **Save Changes** to write the file to disk, or **Discard Changes** to revert to the last saved state.

!!! info "Config paths"
    Config files are resolved relative to the **Working Directory** you entered when adding the server. Games that store configs outside their install folder (e.g. in `%APPDATA%` or a custom absolute path) require an absolute `configPath` to be set in their game config file.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">⚡ Quick Actions</p>

Minecraft, Space Engineers, and Ark each have a set of **Quick Action** buttons that appear below the server controls when a server is online. These fire common commands (save world, list players, etc.) without having to type anything in the console. Quick Actions are only active while the server is running.

---

## <p id="troubleshooting-paths" style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🛠️ Troubleshooting Paths</p>

!!! failure "Server shows 'Offline' immediately after launch"
    1. **Run it manually first.** Open a terminal in the server folder and run the exact command RSM would use. If it fails there, RSM will fail too.
    2. **Check your Working Directory.** Many servers look for config files relative to where they're launched from, not where the `.exe` lives. Set **Working Directory** to the server's root install folder.
    3. **Check for spaces in paths.** Paths containing spaces must be wrapped in double quotes when passed as arguments.

!!! failure "Console shows no output"
    - **DIRECT_CONSOLE games** (Minecraft, Terraria) pipe output directly — if you see nothing, confirm the executable launched and check the **Launch Arguments**.
    - **POWERSHELL_BRIDGE games** (Space Engineers, Ark) read from a log file. Make sure the **Log File / Folder Path** points to the correct folder and that the server is actually writing logs there.

!!! failure "Commands don't work / RCON errors"
    - Confirm RCON is **enabled in the server's config file**, not just in RSM.
    - Double-check that the **Port** and **Password** in RSM match exactly what's in the server config.
    - Make sure the server has fully started before sending commands — RCON connections are refused while the server is still loading.

!!! failure "Edit Config button doesn't appear"
    The button only shows for game types that have config files registered. If you added the server as **Custom / Other**, no config files are defined. Re-add the server using the correct game type card instead.
