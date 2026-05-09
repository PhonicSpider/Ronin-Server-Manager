# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🚀 Getting Started</p>

This guide walks you through everything from downloading RSM to editing your first config file. Follow it top to bottom on a fresh install and you'll have a server running in under ten minutes.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">📥 Step 1 — Download & Install</p>

1. Head to the [Releases](https://github.com/PhonicSpider/Ronin-Server-Manager/releases) page and download the latest `.exe` installer.
2. Run the installer. If Windows SmartScreen warns you, click **More info → Run anyway** — this is expected for unsigned community software.
3. RSM will launch automatically once the install finishes.

!!! tip "No admin required for most servers"
    RSM only needs administrator rights for games that bind to privileged network ports (Space Engineers uses the VRage HTTP API on port 80 by default). A green **Admin** badge appears in the top-right corner of the app when it has elevated privileges.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🏠 Step 2 — First Launch</p>

When RSM opens you'll land on the **Home** view. This is the nerve centre of the app — it shows the combined CPU and RAM used by all your managed servers, a live system log at the bottom, and quick global controls at the top.

<div class="grid cards" markdown>

-   :material-view-dashboard: **Home**

    ---

    Aggregate CPU/RAM gauges and a scrolling system log. The global **Start All** and **Stop All** buttons live here.

-   :material-server: **Manager**

    ---

    Individual server controls — console, resource gauges, Quick Actions, and the Edit Config button. Switch to this view by clicking a server in the sidebar.

-   :material-cog: **Settings**

    ---

    Theme customisation and app behaviour options. Reachable via the **⚙️ App Settings** button at the bottom of the sidebar.

</div>

The sidebar on the left lists every server you've added. It starts empty — that's fine, you'll add one in Step 4.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">⚙️ Step 3 — Configure Your Settings</p>

Open **⚙️ App Settings** in the sidebar before you do anything else. Two things are worth setting up now.

### 🗂️ Config Backup Folder

Every time you save a file in the in-app config editor, RSM writes a timestamped backup before overwriting anything. This is where those backups land.

- The default is `Desktop\RSM-Backups` and is set automatically on first launch.
- Click **Browse** to point it somewhere else — an external drive, a cloud-synced folder, or a dedicated backup location.
- Backups are organised by server name automatically:

```
RSM-Backups\
  MyMinecraftServer\
    server.properties-2026-05-04T15-30-00.bak
  ArkServer\
    GameUserSettings.ini-2026-05-04T18-00-00.bak
```

!!! warning "Don't skip this"
    If the backup folder is missing or the path is unreachable, RSM will warn you in the save status bar but will still save the file. It's worth confirming the folder exists before you make your first edit.

### 🎨 Theme

RSM ships with two theme presets and full custom controls below them.

=== "Presets"

    | Preset | Accent | Background | Best for |
    |---|---|---|---|
    | **Internal Fire** | `#ff4500` deep orange | Near-black `#0a0a0a` | The default RSM look |
    | **Ronin Classic** | `#007bff` blue | Dark navy `#0f111a` | A cooler, more neutral feel |

    Click either button in the **Theme Presets** card to apply instantly.

=== "Custom"

    Three independent controls sit below the presets:

    - **Accent** — buttons, gauges, active highlights, and the modified-file dot in the config editor
    - **Background Base** — the main window colour; choose from the preset swatches or use the colour picker
    - **Text Color** — primary label and description colour
    - **Window Glass Strength** — opacity slider; lower values give the UI a translucent feel if you're running a wallpaper behind it

    All choices are saved to local storage and persist across restarts.

### 🖥️ System Behaviour

- **Launch Manager on Windows Startup** — toggle this on if you want RSM to open automatically when your machine boots. Useful for always-on server hosts.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">➕ Step 4 — Add Your First Server</p>

Before adding a server to RSM, make sure it has been launched manually at least once and starts without errors. RSM manages servers — it does not install or configure them.

1. Click **+ Add New Server** in the sidebar.
2. Pick your game from the card grid.
3. Fill in the wizard fields — what each one means is covered in the [Server Setup Overview](servers/index.md).
4. Click **Save Configuration**. The server appears in the sidebar immediately.

!!! info "Not sure which fields to fill in?"
    Every game type has its own setup guide under **Server Setup** in the left navigation. Each guide explains the exact paths to look for and any game-specific quirks.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">✏️ Step 5 — The Config Editor</p>

Once a server is added, click it in the sidebar to open the **Manager** view, then click **Edit Config** in the control bar. This opens the in-app config editor without touching a file manager.

<div class="grid cards" markdown>

-   :material-file-document-edit: **Tabs**

    ---

    Games with more than one config file (Ark, Minecraft) show a tab bar at the top. Switching tabs with unsaved changes will prompt you to confirm before discarding.

-   :material-numeric: **Line Numbers**

    ---

    Line numbers are shown on the left gutter and a **Ln / Col** counter sits in the bottom-right corner, updating as you move the cursor.

-   :material-content-save: **Saving**

    ---

    Click **Save Changes** or press **Ctrl+S**. A backup is written first, then the file is overwritten. The status bar confirms both: `✓ Saved · backup created`.

-   :material-undo: **Discarding**

    ---

    **Discard Changes** reverts to the last loaded state. The button is greyed out when there's nothing to discard.

-   :material-folder-open: **Open Folder**

    ---

    Click the grey file path at the bottom of the editor to open the containing folder in Explorer — useful for dropping in extra files or checking a backup.

-   :material-alert: **Running Server Warning**

    ---

    A yellow banner appears at the top if the server is currently online. You can still edit and save, but changes won't take effect until the server restarts.

</div>

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl+S` | Save the current file |
| `Esc` | Close the editor (prompts if unsaved changes exist) |

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">⚡ Quick Actions</p>

Minecraft, Space Engineers, and Ark each have a set of **Quick Action** buttons that appear below the server controls when a server is online. These fire common commands (save world, list players, kick, etc.) without typing anything in the console.

Quick Actions are only active while the server is running. They appear automatically for supported game types — no configuration needed.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🗺️ Roadmap</p>

RSM is actively developed. Here's what's planned:

<div class="grid cards" markdown>

-   :material-controller: **Expanded Game Support**

    ---

    More game types added continuously as the community requests them. Each addition brings a dedicated setup guide, config editor support, and Quick Actions.

-   :material-router-wireless: **Ronin Portier Integration**

    ---

    Automatic port forwarding via **Ronin Portier** when adding a new server. Open the ports your game needs without leaving RSM or touching Windows Firewall manually.

-   :material-robot: **Discord Bot API**

    ---

    Integration with a community Discord bot so server admins can monitor server status and receive alerts directly in their Discord guild.

-   :material-download-circle: **One-Click Server Provisioning**

    ---

    Select a game type and RSM downloads the server files automatically, saves them alongside your backups, opens the config editor, and walks you through the setup wizard — all in one flow.

-   :material-wifi: **Network Monitor**

    ---

    A per-server and aggregate bandwidth panel showing live connectivity metrics — think a simple bandwidth monitor scoped to your managed servers, not system-wide noise.

-   :material-chat: **Discord Command Integration**

    ---

    Send commands to managed servers directly from Discord via the bot integration. Restart a server, check player counts, or run console commands without opening RSM.

-   :material-shield-check: **Security Audit**

    ---

    A comprehensive review of every attack surface — automatic updates, file downloads, console command injection, config file path traversal, and API endpoints — to ensure running RSM doesn't open up your machine.

</div>

---

<p align="center"><i>Have a suggestion or found a bug? Open an issue on <a href="https://github.com/PhonicSpider/Ronin-Server-Manager/issues">GitHub</a>.</i></p>
