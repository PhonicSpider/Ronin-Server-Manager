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

**Ronin Server Manager** is a lightweight, local-first application designed to take the headache out of managing dedicated game servers. By leveraging **Electron**, RSM provides a clean Windows-native interface to handle everything from installation to real-time process monitoring.

> [!IMPORTANT]  
> This is a **client-side desktop application**. No web hosting or external databases are required—all server files and configurations stay exactly where they belong: on your machine.

### 🌟 Key Features

* **📦 One-Click Management:** Start, stop, and restart server instances from a unified dashboard.
* **Centralized Server List:** See the status of every server right in the manager, along with their own pages to. checkout their consoles, and resource usage.
* **🔎 Active Resource Monitoring:** Monitor the CPU and RAM usage of your servers individually and overall right in the GUI.
* **🏠 Local-First:** High-speed performance with direct filesystem access via Node.js.
* **🛠️ Automated Configs (WIP):** No more digging through `.ini` or `.json` files; edit settings directly in the GUI.
* **📝 Live Logs:** Integrated console output to monitor your server's health and player activity.
* **🔡 Centralized Command Center(WIP):** Send command to Each server right in their own consoles.
* **📖 Built-in Wiki:** Comprehensive guides powered by MkDocs and Markdown.

---

## 🚀 Quick Start

1. **Download the Executable:** Head over to the [Releases](https://github.com/PhonicSpider/Ronin-Server-Manager/releases) page.
2. **Run the App:** Open `Ronin-Server-Manager.exe`.
3. **Configure Your Game:** Point RSM to your game directory and start your first instance!

---

## 🛠️ Development & Tech Stack

If you want to build the project from source or contribute:

* **Runtime:** [Node.js](https://nodejs.org/)
* **Framework:** [Electron](https://www.electronjs.org/) (JavaScript)
* **Documentation:** [MkDocs](https://www.mkdocs.org/) (Markdown)

### Local Setup
```bash
# Clone the repo
git clone [https://github.com/PhonicSpider/Ronin-Server-Manager.git](https://github.com/PhonicSpider/Ronin-Server-Manager.git)

# Install dependencies
npm install

# Run in development mode
npm start
