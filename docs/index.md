# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">Ronin Server Manager (RSM)</p>

!!! abstract "The Ultimate Server Orchestrator"
    **Ronin Server Manager** is a high-performance, lightweight management suite designed for gamers who host their own dedicated servers. Built on Electron and powered by PowerShell, RSM provides a professional-grade interface for controlling, monitoring, and maintaining game servers without the overhead of heavy enterprise software.

    [Download Latest Release](https://github.com/PhonicSpider/Ronin-Server-Manager){ .md-button .md-button--primary }
    [Setup Guide](adding-servers.md){ .md-button }

---


## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🚀 Key Capabilities</p>

<div class="grid cards" markdown>


-   :material-console-line: __Unified Process Control__

    ---
  
    Forget managing a dozen open windows. RSM tracks your servers using **PID (Process ID) Handoff** technology. Even if the manager is restarted, it can re-attach to your running servers, ensuring you never lose control of a live environment.

-   :material-chart-areaspline: __Real-Time Resource Monitoring__

    ---

    Stay ahead of lag. Every server view shows live metrics updated every 2 seconds.

    * **Arc gauges** display per-server CPU and RAM usage at a glance.
    * A **status dashboard** below the gauges shows active player count, server uptime, and the process ID — visible even when offline so nothing is hidden.
    * The **Network Home** screen shows combined CPU and RAM consumed by all your managed servers, not system-wide noise.


-   :material-console: **Smart Console Integration**

    ---

    Interact with your servers directly through the built-in console.

    * **Monitor startup** logs and identify plugin errors instantly.
    * **Start and stop** all servers at once, or only the one you want.
    * For supported games, **RSM captures and displays** console output in real-time.
    * **Each server** has its own console readout for easier troubleshooting.

-   :material-shield-refresh: __Graceful Shutdowns & Recovery__

    ---
  
    RSM handles your data with care.

    * **Graceful Exit:** For supported games, RSM sends the "stop" command to the console before closing the process, preventing world corruption.
    * **Force Kill:** If a server hangs or freezes, you can terminate the process tree instantly from the UI.

-   :material-cursor-default-click: __Game-Specific Quick Actions__

    ---

    Trigger common server commands with a single click — no console required.

    * **Save world**, adjust time of day, manage players, and more depending on the game.
    * Buttons appear automatically based on the server type and are disabled when the server is offline.
    * Contributors can add new actions per game type in a single config file.

</div>

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🛠️ Supported Game Engines</p>

While RSM is a "Universal Launcher," it is specifically optimized for these environments. Select an engine below to see details:

=== ":material-minecraft: Minecraft"

    **Full support for Java & Bedrock editions.**
    
    * :material-check-circle: Memory allocation (`-Xmx`) support.
    * :material-check-circle: Automatic `.jar` execution.
    * :material-alert-decagram: **EULA Note:** Requires one manual run to accept terms.

    [Minecraft Setup Guide](adding-servers.md#minecraft){ .md-button .md-button--primary }

=== ":material-rocket-launch: Space Engineers"

    **Optimized for Keen Software House dedicated servers.**
    
    * :material-check-circle: Console log scraping for real-time monitoring.
    * :material-check-circle: Specialized tracking for `SpaceEngineersDedicated.exe`.
    * :material-check-circle: Automatic process tree attachment.

    [Space Engineers Guide](adding-servers.md#space-engineers){ .md-button .md-button--primary }

=== ":material-steam: SteamCMD & Universal"

    **Manage any server that runs as a Windows process.**
    
    * :material-check-circle: **SteamCMD:** Compatible with Ark, Rust, DayZ, etc.
    * :material-check-circle: **Universal:** Supports `.bat`, `.exe`, `.ps1`, and `.jar`.
    * :material-information: Console output varies by game engine.

    [Universal Setup Guide](adding-servers.md#universal){ .md-button .md-button--primary }

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🔥 The "Internal Fire" Aesthetic</p>

<div class="grid cards" markdown>

-   :material-palette: __Customizable Style__

    ---
  
    **Customizable options** for almost every aspect of the manager, so you can make it fit your brand or style.

-   :material-lightning-bolt: __Fast Performance__

    ---
  
    Minimal RAM footprint for the manager itself. It stays out of the way of your game's performance.

-   :material-layers-outline: __Clean UI__

    ---
  
    No cluttered menus—just your servers, your stats, and your console in a high-contrast interface.

</div>

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">📥 Getting Started</p>

1.  **Download:** Grab the latest installer from the [Releases](https://github.com/PhonicSpider/Ronin-Server-Manager/releases) page.
2.  **Install:** Run the `.exe` (Click *More Info* -> *Run Anyway* if Windows warns you).
3.  **Configure:** Use our [Setup Guide](adding-servers.md) to add your first world.

---

<p align="center">
  <i><b>Developed for server admins, by server admins.</b></i>
</p>