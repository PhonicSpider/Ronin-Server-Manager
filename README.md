# 🏯 Ronin Server Manager (RSM)

<p align="center">
  <img src="https://raw.githubusercontent.com/PhonicSpider/Ronin-Server-Manager/master/icon.png" alt="RSM Logo" width="180">
  <br>
  <b>The definitive local desktop orchestrator for dedicated game servers.</b>
  <br><br>
  <a href="https://github.com/PhonicSpider/Ronin-Server-Manager/releases/latest">
    <img src="https://img.shields.io/badge/Download-Latest_Release-orange?style=for-the-badge&logo=windows" alt="Download EXE">
  </a>
  <a href="https://phonicspider.github.io/Ronin-Server-Manager/">
    <img src="https://img.shields.io/badge/Documentation-View_Docs-blue?style=for-the-badge&logo=materialformkdocs" alt="View Docs">
  </a>
  <br><br>
  <img src="https://img.shields.io/badge/Platform-Windows-0078D4?style=flat-square&logo=windows" alt="Windows">
  <img src="https://img.shields.io/badge/Built_with-Electron-47848F?style=flat-square&logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/Backend-Node.js-339933?style=flat-square&logo=nodedotjs" alt="Node.js">
</p>

---

## 🖥️ What is RSM?

**Ronin Server Manager** is a lightweight, local-first application designed to take the headache out of managing dedicated game servers. By leveraging **Electron**, RSM provides a clean Windows-native interface to handle everything from **startup** to **real-time process monitoring**--no web hosting, no cloud accounts, no fuss.

> [!IMPORTANT]  
> This is a **client-side desktop application**. No web hosting or external databases are required--all server files and configurations stay exactly where they belong: **ON YOUR MACHINE**.

---

## 🌟 Features

* **📦 One-Click Management:** Start, stop, and restart server instances from a unified dashboard.
* **📊 Server Status Dashboard:** See every server's online/offline state and player counts at a glance from the home view.
* **🔎 Active Resource Monitoring:** Per-server CPU and RAM gauges plus a live connections graph update in real time.
* **📡 Network Monitor:** System-wide bandwidth graph on the home screen and per-server active connection tracking with a rolling 15-minute history graph.
* **🛡️ Firewall Manager (Portier):** Integrated Windows Firewall rule management--apply and remove inbound rules per server from inside the app, or manage all rules from the dedicated Firewall Manager view. *(Requires Administrator privileges)*
* **📝 Live Console:** Integrated console output per server--read logs and send commands without leaving the app.
* **⚡ Quick Actions:** Per-game shortcut buttons *(save world, list players, etc.)* that fire common commands while a server is running.
* **✏️ In-App Config Editor:** Open and edit a server's config files (`.properties`, `.ini`, `.cfg`) directly in RSM--no digging into the file manager needed.
* **🔌 REST API:** Full HTTP API with `x-api-key` authentication, rate limiting, and IP blocking. Exposes server control, status, config file access, backup restore, firewall rule management, and a Forge install proxy--all the hooks the Ronin Citadel portal needs to manage RSM remotely.
* **🔄 Live Server List:** RSM watches `servers.json` for external edits. Add a server by dropping it into the file and it appears in the sidebar within a second--no restart needed.
* **🔍 Startup Scan:** Multi-pass process detection at launch matches running game server executables to your server list automatically, so the sidebar shows the correct live state from the moment RSM opens.
* **🏠 Local-First:** High-speed performance with direct filesystem access via Node.js--nothing leaves your machine.
* **📖 Built-in Docs:** Comprehensive guides powered by MkDocs and hosted at the link above.

---

## 🎮 Supported Games

| Game | Launch Mode | Config Editor | Quick Actions | Firewall Ports |
|---|---|---|---|---|
| **Minecraft (Java)** | Direct console | `server.properties`, `ops.json` | ✅ | Game (25565 TCP), RCON (25575 TCP) |
| **Space Engineers** | PowerShell bridge | `SpaceEngineers-Dedicated.cfg` | ✅ | Game (27016 UDP), Steam (8766 UDP), API (8080 TCP) |
| **ARK: Survival Evolved** | PowerShell bridge | `GameUserSettings.ini`, `Game.ini` | ✅ | Game (7777 UDP), Query (27015 UDP), RCON (27020 TCP) |
| **ARK: Survival Ascended** | PowerShell bridge | `GameUserSettings.ini`, `Game.ini` | ✅ | Game (7777 TCP/UDP), Query (27015 UDP), RCON (27020 TCP) |
| **Rust** | PowerShell bridge | `server.cfg` | ✅ | Game (28015 UDP), Query (28017 UDP), WebRCON (28016 TCP) |
| **Valheim** | PowerShell bridge |--|--| Game (2456 UDP), +1 (2457 UDP), +2 (2458 UDP) |
| **Palworld** | PowerShell bridge | `PalWorldSettings.ini` |--| Game (8211 UDP), REST API (8212 TCP), RCON (25575 TCP, deprecated) |
| **Conan Exiles** | PowerShell bridge | `Engine.ini`, `Game.ini`, `ServerSettings.ini` | ✅ | Game (7777 TCP/UDP), Peer (7778 TCP/UDP), RCON (25575 TCP) |
| **V Rising** | PowerShell bridge | `ServerHostSettings.json`, `ServerGameSettings.json` |--| Game (9876 UDP), Query (9877 UDP), RCON (25575 TCP) |
| **Satisfactory** | PowerShell bridge |--|--| Game/API (7777 TCP+UDP), Beacon (15000 UDP) |
| **Enshrouded** | PowerShell bridge | `enshrouded_server.json` |--| Game (15636 UDP), Query (15637 UDP) |
| **7 Days to Die** | Direct console | `serverconfig.xml` | ✅ | Game (26900 TCP/UDP), Telnet (8081 TCP), Control Panel (8080 TCP) |
| **Project Zomboid** | Direct console |--| ✅ | Game (16261 TCP/UDP), RCON (27015 TCP) |
| **Sons of the Forest** | PowerShell bridge |--|--| Game (8766 TCP/UDP), Query (27016 UDP), Blob Sync (9700 TCP) |
| **Soulmask** | PowerShell bridge |--| ✅ | Game (7777 TCP/UDP), Query (27015 UDP), RCON (19000 TCP) |
| **Abiotic Factor** | PowerShell bridge |--|--| Game (7777 TCP/UDP, max 6 players) |
| **Terraria** | Direct console | `serverconfig.txt` | ✅ | Game (7777 TCP) |
| **Custom / Other** | Direct console |--|--|--|

> Need a game that isn't listed? Use the **Custom / Other** card in the Add Server wizard and fill in the paths manually.

---

## 🚀 Quick Start

1. **Download the installer** from the [Releases](https://github.com/PhonicSpider/Ronin-Server-Manager/releases) page and run it.
2. **Open RSM**--you'll land on the home dashboard.
3. **Click + Add New Server** in the sidebar and pick your game from the card grid.
4. **Fill in the wizard fields** (executable path, working directory, and any game-specific options).
5. **Hit Save Configuration**--your server will appear in the sidebar ready to start.

> [!TIP]
> Make sure your server has been launched manually at least once before adding it to RSM. RSM manages servers--it does not install or configure them... *yet*. See the [Server Setup docs](https://phonicspider.github.io/Ronin-Server-Manager/servers/) for details.

---

## 🛠️ Development & Tech Stack

* **Runtime:** [Node.js](https://nodejs.org/)
* **Framework:** [Electron](https://www.electronjs.org/) (JavaScript)
* **Documentation:** [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) (Markdown)

### Local Setup
Run this command in the terminal of your IDE. You MUST be in the root folder where you want RSM to live.

```bash
# Clone the repo
git clone https://github.com/PhonicSpider/Ronin-Server-Manager.git

# Install dependencies
npm install

# Run in development mode
npm start
```

---

## 🤝 Contributing

Bug fixes, new game modules, and UI improvements are all welcome. Here's how to get started:

### 1. 🏗️ Prerequisites
* **Node.js** v18 or higher
* **npm** (bundled with Node.js)
* **Python**--only needed if you want to preview the MkDocs documentation locally

### 2. 🌿 Branching Strategy
* **Fork** the repository to your own GitHub account.
* Create a feature branch off `master`:
  ```bash
  git checkout -b feature/[your-feature-name]
  ```
* Keep commits concise and descriptive--one logical change per commit.

### 3. 💻 Coding Standards
* **JavaScript/Electron:** Follow standard JS naming conventions (camelCase for variables and functions).
* **Local-First:** New features must not introduce cloud dependencies or external database requirements.
* **Modularity:** Game-specific logic lives in `public/configs/<game>.js`. Keep the core orchestrator clean. Anything that would be game specific like file locations, names, ports, etc. should be kept in the configuration files for that game type.

### 4. 📝 Documentation
The docs live in `/docs` and are built with MkDocs Material. To preview locally:
```bash
# install MKDocs
pip install mkdocs-material

#Run MKDocs
mkdocs serve
```

The terminal will show you the link to go to on your machine to view the docs locally.

### 5. 🚀 Submitting a Pull Request
* Push your branch to your fork and open a PR against `master`.
* Describe what the PR solves and call out any breaking changes.
* We'll review it as soon as we can!

---

### 🆘 Need Help?

Check the [Issues](https://github.com/PhonicSpider/Ronin-Server-Manager/issues) tab or open a new discussion if you want to talk through an idea first.

You can also join the [discord](https://discord.gg/TBt85JsCg) and reach us there. Would love to chat about your ideas or help you out!

---

## ⚖️ License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.  
This ensures the software remains free and open-source, and any derivative works must also be shared under the same terms.
