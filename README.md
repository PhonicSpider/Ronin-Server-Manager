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

**Ronin Server Manager** is a lightweight, local-first application designed to take the headache out of managing dedicated game servers. By leveraging **Electron**, RSM provides a clean Windows-native interface to handle everything from startup to real-time process monitoring — no web hosting, no cloud accounts, no fuss.

> [!IMPORTANT]  
> This is a **client-side desktop application**. No web hosting or external databases are required — all server files and configurations stay exactly where they belong: on your machine.

---

## 🌟 Features

* **📦 One-Click Management:** Start, stop, and restart server instances from a unified dashboard.
* **📊 Server Status Dashboard:** See every server's online/offline state and player counts at a glance from the home view.
* **🔎 Active Resource Monitoring:** Per-server and aggregate CPU and RAM gauges update in real time.
* **📝 Live Console:** Integrated console output per server — read logs and send commands without leaving the app.
* **⚡ Quick Actions:** Per-game shortcut buttons (save world, list players, etc.) that fire common commands while a server is running.
* **✏️ In-App Config Editor:** Open and edit a server's config files (`.properties`, `.ini`, `.cfg`) directly in RSM — no file manager needed.
* **🏠 Local-First:** High-speed performance with direct filesystem access via Node.js — nothing leaves your machine.
* **📖 Built-in Docs:** Comprehensive guides powered by MkDocs and hosted at the link above.

---

## 🎮 Supported Games

| Game | Launch Mode | Config Editor | Quick Actions |
|---|---|---|---|
| **Minecraft (Java)** | Direct console | `server.properties`, `ops.json` | ✅ |
| **Space Engineers** | PowerShell bridge | `SpaceEngineers-Dedicated.cfg` | ✅ |
| **Ark: Survival Evolved** | PowerShell bridge | `GameUserSettings.ini`, `Game.ini` | ✅ |
| **Terraria** | Direct console | `serverconfig.txt` | — |
| **Custom / Other** | Direct console | — | — |

> Need a game that isn't listed? Use the **Custom / Other** card in the Add Server wizard and fill in the paths manually.

---

## 🚀 Quick Start

1. **Download the installer** from the [Releases](https://github.com/PhonicSpider/Ronin-Server-Manager/releases) page and run it.
2. **Open RSM** — you'll land on the home dashboard.
3. **Click + Add New Server** in the sidebar and pick your game from the card grid.
4. **Fill in the wizard fields** (executable path, working directory, and any game-specific options).
5. **Hit Save Configuration** — your server will appear in the sidebar ready to start.

> [!TIP]
> Make sure your server has been launched manually at least once before adding it to RSM. RSM manages servers — it does not install or configure them. See the [Server Setup docs](https://phonicspider.github.io/Ronin-Server-Manager/servers/) for details.

---

## 🛠️ Development & Tech Stack

* **Runtime:** [Node.js](https://nodejs.org/)
* **Framework:** [Electron](https://www.electronjs.org/) (JavaScript)
* **Documentation:** [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) (Markdown)

### Local Setup
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
* **Python** — only needed if you want to preview the MkDocs documentation locally

### 2. 🌿 Branching Strategy
* **Fork** the repository to your own GitHub account.
* Create a feature branch off `master`:
  ```bash
  git checkout -b feature/your-feature-name
  ```
* Keep commits concise and descriptive — one logical change per commit.

### 3. 💻 Coding Standards
* **JavaScript/Electron:** Follow standard JS naming conventions (camelCase for variables and functions).
* **Local-First:** New features must not introduce cloud dependencies or external database requirements.
* **Modularity:** Game-specific logic lives in `public/configs/<game>.js`. Keep the core orchestrator clean.

### 4. 📝 Documentation
The docs live in `/docs` and are built with MkDocs Material. To preview locally:
```bash
pip install mkdocs-material
mkdocs serve
```

### 5. 🚀 Submitting a Pull Request
* Push your branch to your fork and open a PR against `master`.
* Describe what the PR solves and call out any breaking changes.
* We'll review it as soon as we can!

---

### 🆘 Need Help?

Check the [Issues](https://github.com/PhonicSpider/Ronin-Server-Manager/issues) tab or open a new discussion if you want to talk through an idea first.

---

## ⚖️ License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.  
This ensures the software remains free and open-source, and any derivative works must also be shared under the same terms.
