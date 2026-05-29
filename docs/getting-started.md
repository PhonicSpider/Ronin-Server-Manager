# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🚀 Getting Started</p>

This guide walks you through everything from downloading RSM to editing your first config file. Follow it top to bottom on a fresh install and you'll have a server running in under ten minutes.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">📥 Step 1--Download & Install</p>

1. Head to the [Releases](https://github.com/PhonicSpider/Ronin-Server-Manager/releases) page and download the latest `.exe` installer.
2. Run the installer. If Windows SmartScreen warns you, click **More info → Run anyway**--this is expected for unsigned community software.
3. RSM will launch automatically once the install finishes.

!!! tip "When do you need Administrator?"
    Two features require RSM to be launched as Administrator:

    - **Firewall Manager (Portier)**--creating and removing Windows Firewall rules always requires elevation.
    - **Some game servers**--games that bind to privileged network ports (Space Engineers uses the VRage HTTP API on port 80 by default) need an elevated host process.

    A green **Admin** badge appears in the top-left corner of the app when it has elevated privileges. Everything else works fine without it.

    It's usually best *(and recommended)* to always run RSM in Aadministrator for these reason though.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🏠 Step 2--First Launch</p>

When RSM opens you'll land on the **Home** view. This is the nerve centre of the app--it shows the combined CPU and RAM used by all your managed servers, a live system bandwidth graph, a scrolling system log, and quick global controls at the top.

<div class="grid cards" markdown>

-   :material-view-dashboard: **Home**

    ---

    Aggregate CPU/RAM gauges, a live system bandwidth graph (receive and transmit), your full server status list, and the system log. This is the first place to look when something seems off.

    ![ServerManager Home - glow](../assets/images/server-dets/networkHome.png)

-   :material-server: **Manager**

    ---

    Individual server controls--console, resource gauges, connections graph, Quick Actions, Firewall Ports, and the Edit Config button. Switch to this view by clicking any server in the sidebar.

    ![ServerManager Manager - glow](../assets/images/server-dets/managerScreen.png)

-   :material-shield-check: **Firewall Manager**

    ---

    Full overview of all RSM-managed Windows Firewall rules, plus a form to add custom rules. Reachable via the **🛡️ Firewall Manager** item in the sidebar. Requires Administrator.

    ![ServerManager Firewall - glow](../assets/images/server-dets/firewallMngr.png)

-   :material-cog: **Settings**

    ---

    Theme customisation and app behaviour options. Reachable via the **⚙️ App Settings** button at the bottom of the sidebar.

    ![ServerManager Settings - glow](../assets/images/server-dets/appSettings.png)

</div>

The sidebar on the left lists every server you've added. It starts empty--that's fine, you'll add one in Step 4.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">⚙️ Step 3--Configure Your Settings</p>

Open **⚙️ App Settings** in the sidebar before you do anything else. Two things are worth setting up now.

### 🗂️ Config Backup Folder

![ServerManager Backups - glow](../assets/images/server-dets/bkupLocation.png)

Every time you save a file in the in-app config editor, RSM writes a timestamped backup before overwriting anything. This is where those backups land.

- The default is `Desktop\RSM-Files\RSM-Backups` and is set automatically on first launch.
- Click **Browse** to point it somewhere else--an external drive, a cloud-synced folder, or a dedicated backup location.
- Backups are organised by server name automatically:

```
RSM-Backups\
  MyMinecraftServer\
    server.properties-2026-05-04T15-30-00.bak
  ArkServer\
    GameUserSettings.ini-2026-05-04T18-00-00.bak
```

!!! info "Automatic setup"
    RSM sets `Desktop\RSM-Files\RSM-Backups` as the default on first launch and creates the folder automatically, and will create a folder for the specific server once a file is saved. You only need to change it if you'd prefer backups stored somewhere else. The only time backups can fail is if you've changed the path to a drive or network share that isn't available.

### 🎨 Theme

RSM ships with two theme presets and full custom controls below them.

=== "Presets"

    | Preset | Accent | Background | Best for |
    |---|---|---|---|
    | **Internal Fire** | `#ff4500` deep orange | Near-black `#0a0a0a` | The "Dark Mode" look |
    | **Ronin Classic** | `#007bff` blue | Dark navy `#0f111a` | A cooler, more neutral feel |

    Click either button in the **Theme Presets** card to apply instantly.

=== "Custom"

    Three independent controls sit below the presets:

    - **Accent**--buttons, gauges, active highlights, and the modified-file dot in the config editor
    - **Background Base**--the main window colour; choose from the preset swatches or use the colour picker
    - **Text Color**--primary label and description colour
    - **Window Glass Strength**--opacity slider; lower values give the UI a translucent feel if you're running a wallpaper behind it

    All choices are saved to local storage and persist across restarts.

### 🖥️ System Behaviour

- **Launch Manager on Windows Startup**--toggle this on if you want RSM to open automatically when your machine boots. Useful for always-on server hosts.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">➕ Step 4--Add Your First Server</p>

Before adding a server to RSM, make sure it has been launched manually at least once and starts without errors. RSM manages servers--it does not install or configure them... *yet*.

1. Click **+ Add New Server** in the sidebar.
2. Pick your game from the card grid. 
*(If your game is not there, don't worry, just choose "other")*.
3. Fill in the wizard fields--what each one means is covered in the [Server Setup Overview](servers/index.md), plus, The default infor should be filled in or put in as a placeholder. You can usually find what you jneed in those locations.
4. Click **Save Configuration**. The server appears in the sidebar immediately.

!!! info "Not sure which fields to fill in?"
    Every game type has its own setup guide under **Server Setup** in the left navigation. Each guide explains the exact paths to look for and any game-specific quirks. If your server is not listed in the guide, don't worry. RSM will still be able to manage it!

    First, send us a message in discord or in the discussions and we can see about adding the game as one that can be selected. *(if you know coding or how the server is set up, you can do it too through github! notes on how to are in the "[Contributing](contributing.md)" page)*

    Second, just select **"Other"** when choosing your game type. It will show all fields that RSM is able to save to run a server. Fill out as best you can based on the info provided here and RSM will handle the rest for you!

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">✏️ Step 5--The Config Editor</p>

Once a server is added, click it in the sidebar to open the **Manager** view, then click **Edit Config** in the control bar. This opens the in-app config editor without touching a file manager.

<div class="grid cards" markdown>

-   :material-file-document-edit: **Tabs**

    ---

    Games with more than one config file (Ark, Minecraft) show a tab bar at the top. Switching tabs with unsaved changes will prompt you to confirm before discarding.

    ![ServerManager Tabs - glow](../assets/images/server-dets/tabs.png)

-   :material-numeric: **Line Numbers**

    ---

    Line numbers are shown on the left gutter and a **Ln / Col** counter sits in the bottom-right corner, updating as you move the cursor.

    ![ServerManager Lines - glow](../assets/images/server-dets/lineNums.png)

-   :material-content-save: **Saving**

    ---

    Click **Save Changes** or press **Ctrl+S**. A backup is written first, then the file is overwritten. The status bar confirms both: `✓ Saved · backup created`.

    ![ServerManager Save - glow](../assets/images/server-dets/saveChngs.png)

-   :material-undo: **Discarding**

    ---

    **Discard Changes** reverts to the last loaded state. The button is greyed out when there's nothing to discard.

    ![ServerManager discard - glow](../assets/images/server-dets/discardCh.png)

-   :material-folder-open: **Open Folder**

    ---

    Click the grey file path at the bottom of the editor to open the containing folder in Explorer--useful for dropping in extra files or checking a backup.

    ![ServerManager Folder - glow](../assets/images/server-dets/openFold.png)

-   :material-alert: **Running Server Warning**

    ---

    A yellow banner appears at the top if the server is currently online. You can still edit and save, but changes won't take effect until the server restarts.

    ![ServerManager Banner - glow](../assets/images/server-dets/bannerWarn.png)

</div>

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl+S` | Save the current file |
| `Esc` | Close the editor (prompts if unsaved changes exist) |

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">⚡ Quick Actions</p>

Minecraft, Space Engineers, and Ark each have a set of **Quick Action** buttons that appear below the server controls when a server is online. These fire common commands (save world, list players, kick, etc.) without typing anything in the console. Future games that get added as default choices will have these as well.

Quick Actions are only active while the server is running. They appear automatically for supported game types--no configuration needed.

If you know of any common commands for a server type that may be useful to add to this bar, let us know in discussions or in the discord and we can look into adding them!

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🛡️ Step 6--Firewall Manager (Portier)</p>

![ServerManager Firewall - glow](../assets/images/server-dets/firewallMngr.png)

RSM includes a built-in Windows Firewall manager so you never have to touch the Windows Firewall GUI to open ports for your servers.

!!! warning "Requires Administrator"
    All firewall operations need RSM to be running with Administrator privileges. Re-launch RSM as Administrator if you see a permission error. The green **Admin** badge in the top-left corner confirms you're elevated.

### Per-Server Firewall Ports Card

Every server panel has a **Firewall Ports** card showing the ports that server needs by default. These can be changed at anytime and RSM will automatically close the previous ports, and open the new ones without you having to search for them!

 For each port you can:

- **Edit the port number**--override the default if you've changed it in the game's config
- **Toggle TCP / UDP**--enable only the protocols the game actually uses
- Click **Save Changes** to store your overrides for that server

Once your ports are configured, two buttons control the firewall rules:

| Button | What it does |
|---|---|
| **Apply Rules** | Creates inbound Windows Firewall allow rules for every port listed |
| **Remove Rules** | Removes all RSM-managed rules for this server |

A status indicator in the card header shows **● Rules Active** or **○ No Rules** so you always know the current state.

### Firewall Manager View

Click **🛡️ Firewall Manager** in the sidebar for a full overview of every rule RSM has created across all servers. From here you can:

- See every rule at a glance--name, protocol, port, and enabled status
- Remove any rule individually
- **Add a custom rule** with a display name, port, and protocol--useful for ports that aren't tied to a specific managed server

The **Activity Log** at the bottom of the Firewall Manager view records every add, remove, and error with a timestamp.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🗺️ Roadmap</p>

RSM is actively being developed. It may take a while, but here's what's planned for the future of RSM:

<div class="grid cards" markdown>

-   :material-controller: **Expanded Game Support**

    ---

    More game types added continuously as the community requests them. Each addition brings a dedicated setup guide, config editor support, Quick Actions, and default firewall port definitions.

-   :material-download-circle: **One-Click Server Provisioning**

    ---

    Select a game type and RSM downloads the server files automatically, saves them alongside your backups, opens the config editor, and walks you through the setup wizard--all in one flow.

-   :material-robot: **Discord Bot API**

    ---

    Integration with a custom community Discord bot so server admins can monitor server status and receive alerts directly in their Discord server.

    The bot is already usable on its own for many features for free. Check it out here: [Arken Bot](https://arkenbot.app)

-   :material-chat: **Discord Command Integration**

    ---

    Send commands to managed servers directly from Discord via the bot integration--restart a server, check player counts, or run console commands without opening RSM.

-   :material-window-minimize: **Mini Server Status Card**

    ---

    A compact overlay showing server names, status, and player counts--visible when RSM is minimised so you can keep an eye on things without bringing the full app into focus.

-   :material-shield-check: **Security Audit**

    ---

    A comprehensive review of every attack surface--file downloads, console command injection, config file path traversal, and API endpoints--to make sure running RSM doesn't open up your machine.

</div>

---

<p align="center"><i>Have a suggestion or found a bug? Open an issue on <a href="https://github.com/PhonicSpider/Ronin-Server-Manager/issues">GitHub</a>.</i></p>
