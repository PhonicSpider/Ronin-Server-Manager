# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🏗️ Server Setup Overview</p>

Adding a server to **Ronin Server Manager** is straightforward, but it requires two key pieces of information: the **Executable Path** and the **Arguments**.

In some cases (like Minecraft) you may even need a 3rd location for the **Working Directory**.

Be sure to follow the steps for your specific server in order to get everything working properly. Each game engine has its own quirks when it comes to how it handles console output, process management, and file paths, so **read carefully!**

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">⚠️ Prerequisite: The "First Run"</p>

Before adding a server to RSM, ensure the server is fully configured and has been launched at least once manually. 

This includes adding any mods, accepting Eula's, and confirming that the server starts without errors. RSM relies on this "first run" to establish the correct file paths and configurations.

Pay attention to any arguments that servers run automatically when starting, and any file paths that they look for in their default state. RSM will need to replicate these conditions to function properly.

<div class="grid cards" markdown>

-   :material-play-circle: **Run Once Manually**

    ---

    Double-click your `.bat` or `.exe` file to ensure the server starts without errors before linking it to RSM.

-   :material-folder: *Add Your Mods**

    ---

    If your server uses mods, add them to the server's mod folder or GUI and run the server once to ensure they load correctly.

-   :material-file-check: **License/EULA**

    ---

    Ensure you have accepted any EULAs (like Minecraft's `eula.txt`) or licenses required by the game engine.

-   :material-wall: **Firewall Rules**

    ---

    Ensure you have opened the necessary ports (e.g., 25565 or 27015) in your Windows Firewall settings.

</div>

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🎮 Select Your Game Engine</p>

Pick your game below for specific pathing requirements and startup arguments.

<div class="grid cards" markdown>

-   :material-minecraft: **Minecraft (Java)**

    ---
    Setup for Java Edition. Requires pointing to `java.exe` and using `-nogui`.
    
    [:octicons-arrow-right-24: View Guide](minecraft.md)

-   :material-rocket-launch: **Space Engineers**

    ---
    Native Windows binary setup. Requires Admin rights for network binding.
    
    [:octicons-arrow-right-24: View Guide](space-engineers.md)

-   :material-steam: **SteamCMD Games**

    ---
    Generic setup for Ark, Rust, and other Steam dedicated binaries.
    
    [:octicons-arrow-right-24: View Guide](#)

</div>

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🛠️ Troubleshooting Paths</p>

!!! failure "Server says 'Stopped' immediately"
    1.  **Check Quotes:** If your path has spaces (e.g., `C:\My Games\`), wrap the path in **double quotes**.
    2.  **Verify Permissions:** Ensure the user running RSM has "Read/Write" access to the game folder.