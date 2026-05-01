# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🛠️ Troubleshooting Guide</p>

!!! abstract "How to Use This Guide"
    This guide is split into two chapters. **Chapter 1** covers problems that can happen with any server type. **Chapter 2** covers issues specific to each game. If you are unsure which applies to you, start at the top and work down — most problems are universal.

    Use **Ctrl+F** to search for the exact error message you are seeing.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">Chapter 1 — Universal Issues</p>

These issues can occur with any game type regardless of server software.

---

### ▶️ Server Starts Then Immediately Goes Offline {: .rsm-header }

The server process launched but exited before RSM could attach to it.

??? failure "Server crashes on launch"

    **Step 1 — Run it manually first.**  
    Outside of RSM, navigate to your server folder and launch the executable directly. If it fails here too, the problem is with the server software itself, not RSM.  
    Common causes: missing prerequisite files, unaccepted EULA, missing `.dll` libraries next to the executable.

    **Step 2 — Check your Working Directory.**  
    This is the most common cause of an instant crash. The server executable often expects to be launched *from inside* its own folder so it can find `.dll`, config, and data files.  
    Set the **Working Directory** to the folder that *contains* the server executable, not a parent folder above it.

    **Step 3 — Check your Arguments.**  
    An unrecognised flag or a malformed argument string (e.g. mismatched quotes) will cause most server software to exit with code 1.  
    Review your **Arguments** field and compare against the examples in the relevant [Server Setup Guide](servers/index.md).

    **Step 4 — Run RSM as Administrator.**  
    Some servers need to bind to low-number network ports or write to protected directories. Right-click the RSM shortcut and select **Run as administrator**. Check that the admin badge in the RSM header turns green.

---

### 🖥️ Console is Blank — No Output Appearing {: .rsm-header }

The server is running but RSM shows no text in the console panel.

??? warning "Blank console for a running server"

    The cause depends on which category your server uses.

    **DIRECT_CONSOLE games (Minecraft, 7 Days to Die)**  
    RSM reads the process's standard output stream. If the server opens its own GUI window instead of writing to stdout, the stream RSM captures will be empty.

    - Ensure `nogui` or `--nogui` is at the end of your **Arguments** field.
    - Ensure RSM is running as Administrator so it has permission to attach to the process stream.

    **POWERSHELL_BRIDGE games (Space Engineers, Ark, Terraria)**  
    RSM tails a log file on disk. If the log file path is wrong, empty, or the game hasn't written to it yet, the console will be blank.

    - Double-check your **Log Path** field points to the *folder* containing `.log` files, not a specific file.
    - Wait 15–30 seconds after the server starts. Some games (especially Ark) buffer log writes and the first output can take up to a minute.
    - Ensure the game is configured to write logs (see the game-specific section below).

---

### 🔴 Status Dot Not Updating After Shutdown {: .rsm-header }

The green pulse stays green for several seconds after clicking **Shutdown**, or never turns red at all.

??? warning "Status dot is slow or stuck"

    **Normal delay (up to ~3 seconds):** RSM sends a graceful shutdown signal via PowerShell (`CloseMainWindow`), waits for the OS to acknowledge, then immediately triggers the UI update. A 2–4 second delay is expected on most machines.

    **Longer delay / never updates:**  
    - Check the System Console in RSM for a line that says `RSM-WARN: PID still active`. This means the game process is taking a long time to save and exit. This is normal for large Minecraft worlds or long Space Engineers autosaves.  
    - If the server is completely frozen and not responding to the graceful signal, use the **Force Kill** button instead. This sends `taskkill /F /T` to the process tree and the dot will update within one heartbeat cycle (5 seconds).

---

### 📂 Browse Buttons Don't Open File Explorer {: .rsm-header }

Clicking a **Browse** button in the Add Server wizard does nothing.

??? failure "File/folder picker does not open"

    This is caused by running an outdated version of RSM where the file picker IPC channels were not whitelisted. Update to the latest release — this was resolved in the `server-selection-rework` update.

    If you are building from source, ensure `open-dialog` and `select-folder` are present in the `invoke` whitelist in `preload.js`.

---

### 🔄 Two Servers Sharing the Same PID / Wrong Server Goes Online {: .rsm-header }

You start a second instance of the same game and RSM assigns the same PID to both, or marks the wrong server as Online.

??? failure "Duplicate PID across multiple instances"

    **Root cause:** RSM's deep PID search discriminates between multiple instances of the same EXE using the **Working Directory** path. If two servers share the same working directory, RSM cannot tell them apart.

    **Fix:**  
    1. Ensure every server instance has a **unique Working Directory**.  
    2. For games that include the instance path in their launch arguments (like Space Engineers with `-path`), also ensure the argument path matches the working directory exactly.  
    3. If one server instance is already running and you start a second, RSM will never assign the first server's confirmed PID to the new one — but both must have distinct directories for the second search to succeed.

    See the [Space Engineers multi-instance section](#space-engineers) below for the most common example of this.

---

### 👻 Server Shows "Online" Immediately After RSM Restarts {: .rsm-header }

RSM was restarted (or the PC was rebooted) and a server that was previously stopped is incorrectly shown as Online.

??? info "Ghost Online status on startup"

    On startup RSM resets all saved server statuses to **Offline** before the UI loads, so this should not occur in current versions. If you see it:

    - Click **Force Kill** on the affected server. If the process is genuinely gone, the button will do nothing and the status will correct itself on the next heartbeat (within 5 seconds).
    - If the server truly *is* still running from a previous session, RSM's heartbeat will re-attach to it within one cycle. This is **PID Handoff** working as designed.

---

### ⚡ Quick Actions / Console Commands Do Nothing {: .rsm-header }

You click a Quick Action button or type a command and nothing happens on the server.

??? warning "Commands are sent but have no effect"

    The command path depends on the server type:

    | Server Type | How Commands Are Sent | What Can Go Wrong |
    | :--- | :--- | :--- |
    | Minecraft | Written directly to process stdin | Server not fully started yet; wait for `Done!` in logs |
    | Space Engineers | HTTP API (`axios` to `localhost:PORT`) | Wrong API port or API password in RSM settings |
    | Ark | RCON protocol (`rcon-client` to `localhost:PORT`) | Wrong RCON port or admin password; `-RCONEnabled` missing from args |
    | Terraria | No command API available | Terraria has no RCON — commands must be typed in its own console |

    **General checklist:**

    - Confirm the server has fully started before sending commands (watch for a "ready" line in the console).
    - For RCON/API games, verify the port and password in RSM match exactly what is in the server's config or launch arguments.
    - Ensure the relevant firewall port is open on `localhost` (even local connections can be blocked by security software).

---

### 🛡️ Admin Badge is Red / Missing {: .rsm-header }

The shield icon in the RSM header is red, indicating RSM is not running with Administrator privileges.

??? warning "RSM not running as administrator"

    Some server types (Space Engineers in particular) need to bind to network ports and write to `C:\ProgramData`, both of which require elevated rights.

    - Close RSM.
    - Right-click the RSM shortcut or `.exe` and select **Run as administrator**.
    - To make this permanent: right-click → Properties → Compatibility → check **Run this program as an administrator**.

---

### 💾 RSM Itself Is Using High CPU or RAM {: .rsm-header }

The manager's own process is consuming significant resources, separate from the game servers.

??? info "RSM resource usage"

    RSM polls each running server every **5 seconds** via `tasklist` and WMIC for CPU/RAM metrics. This is lightweight by design, but a few situations can increase overhead:

    - **Many running servers simultaneously** — each has its own heartbeat interval.
    - **Very large log files** — RSM tails log files from the last-read position, but extremely high log output (debug mode servers) can create a backlog. Disable verbose/debug logging in the game server's config if possible.
    - **Deep search loop running** — if RSM is stuck searching for a PID, you will see repeated `deep search` lines in the System Console. This burns CPU. If it does not resolve within 30 seconds, stop the server and restart it.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">Chapter 2 — Game-Specific Issues</p>

Select your game below.

=== ":material-minecraft: Minecraft"

    ### ⚠️ Server Exits Immediately — EULA Not Accepted {: .rsm-header }

    ??? failure "Server closes with 'You need to agree to the EULA'"

        Minecraft will not start until `eula.txt` is manually accepted.

        1. Run your `server.jar` once outside of RSM. It will generate `eula.txt` in the Working Directory and then exit.
        2. Open `eula.txt` in a text editor.
        3. Change `eula=false` to `eula=true` and save.
        4. Start the server through RSM as normal.

    ---

    ### ☕ Java Not Found or Wrong Version {: .rsm-header }

    ??? failure "RSM can't find java.exe or server starts with errors"

        RSM requires the **full path** to `java.exe`, not just `java`. The system `PATH` is not used.

        - Open a terminal and run `where java` to find the location.
        - Navigate to `C:\Program Files\Java\` and find the correct JDK version folder. The path should look like `C:\Program Files\Java\jdk-21\bin\java.exe`.
        - Modern Minecraft versions (1.17+) require **Java 17 or 21**. Older versions may require Java 8.
        - If you have multiple Java versions installed, make sure the path in RSM points to the correct one for your server version.

    ---

    ### ❌ Server Window Opens but Console is Blank {: .rsm-header }

    ??? warning "Output visible in the Java window but not in RSM"

        The Minecraft server opened its built-in GUI window, which does not write to stdout. RSM cannot read this stream.

        - Add `nogui` or `--nogui` to the **end** of your Arguments field.
        - Your arguments should look like: `-Xmx4G -Xms2G -jar fabric-server-launcher.jar --nogui`

    ---

    ### 💾 Server Lags Badly or Runs Out of Memory {: .rsm-header }

    ??? warning "RAM allocation issues"

        | Symptom | Likely Cause | Fix |
        | :--- | :--- | :--- |
        | Constant lag / GC pauses | `-Xms` too low | Set `-Xms` equal to `-Xmx` (e.g. both `4G`) |
        | Instant crash on start | `-Xmx` higher than available RAM | Lower your max RAM; leave 2GB free for Windows |
        | `OutOfMemoryError` in logs | Max heap too small for the modpack | Increase `-Xmx` (try `6G` for heavy modpacks) |

    ---

    ### ❓ `server.jar` Not Found {: .rsm-header }

    ??? failure "Error: unable to access jarfile server.jar"

        The `-jar` argument in RSM is a **relative path** resolved from the Working Directory. If the jar filename does not exactly match, Java will fail to start.

        - Confirm the jar file exists in the Working Directory.
        - Check the exact filename. Fabric uses `fabric-server-launcher.jar`, Forge uses `forge-X.X.X.jar`, Vanilla uses `server.jar`. Update your `-jar` argument to match.


=== ":material-rocket-launch: Space Engineers"

    ### 🔌 Second Instance Fails — Port Already In Use {: .rsm-header }

    ??? failure "Error binding server endpoint: Only one usage of each socket address"

        This error appears in the Space Engineers log when two instances are configured to use the **same game port** (default `27016`). This is a setting inside the Space Engineers dedicated server config, not in RSM.

        1. Navigate to the second instance's folder: `C:\ProgramData\SpaceEngineersDedicated\YourInstance\`
        2. Open `SpaceEngineers-Dedicated.cfg` in a text editor.
        3. Find the `<ServerPort>` tag and change it to an unused port (e.g. `27017`, `27018`).
        4. Also ensure the `<SteamPort>` value is different between instances.
        5. Restart the second instance.

        !!! tip "Each instance needs three unique ports"
            Game Port (`ServerPort`), Steam Query Port (`ServerQueryPort`), and API Port (the one entered in RSM). Make sure all three are different across every instance you run simultaneously.

    ---

    ### 🕐 Console Output is Delayed by 1–2 Seconds {: .rsm-header }

    ??? info "Slight delay in SE log output — this is normal"

        Space Engineers runs headless and writes output to a physical log file on disk. RSM "tails" this file by checking it every second for new lines. A **1–2 second delay** between in-game events and them appearing in the RSM console is expected behaviour and is not a bug.

    ---

    ### 💻 Commands Return No Response {: .rsm-header }

    ??? warning "Quick Actions or console commands do nothing in SE"

        SE commands are sent via its HTTP API. Three things must be correct:

        1. **`-console` must be in your Arguments.** Without this flag, the SE dedicated server does not start its HTTP API endpoint.
        2. **API Port** in RSM must match the port SE is actually listening on (default `8080`). Check `SpaceEngineers-Dedicated.cfg` for the `<RemoteApiPort>` value.
        3. **API Password** in RSM must match the `<RemoteSecurityKey>` value in the same config file. If this field is blank in the config, leave it blank in RSM too.

    ---

    ### 📁 `-path` Argument Must Match Working Directory {: .rsm-header }

    ??? warning "SE loads the wrong instance or wrong world"

        RSM uses the **Working Directory** field to identify which SE instance to attach to when running multiple instances side-by-side. The `-path` argument in your **Arguments** field must be the **exact same path** as the Working Directory.

        Example — if your Working Directory is `C:\ProgramData\SpaceEngineersDedicated\Survival`, your Arguments must include:

        ```
        -console -ignorelastsession -path "C:\ProgramData\SpaceEngineersDedicated\Survival"
        ```

        If these do not match, RSM may attach to the wrong SE instance.

    ---

    ### 🛡️ SE Crashes Immediately — Admin Rights Required {: .rsm-header }

    ??? failure "Access denied or network binding errors on start"

        Space Engineers Dedicated Server must bind to network ports and write to `C:\ProgramData`, both protected locations. RSM must be running as Administrator.

        Check that the **admin shield badge** in the RSM header is green before starting any SE server.


=== ":material-paw: Ark: Survival"

    ### 🖥️ Console is Empty After Server Starts {: .rsm-header }

    ??? warning "No log output in RSM for an Ark server"

        Ark does not write a log file by default. Two things are required:

        1. Add **`-servergamelog`** to your Arguments. Without this flag, Ark never creates the `.log` file RSM reads.
        2. Confirm your **Log Path** in RSM points to the `Saved\Logs` folder, e.g.:  
           `...\ShooterGame\Saved\Logs`  
           This folder is only created after the server has run at least once. Run it once outside of RSM to generate it.

        !!! info "Ark logs are buffered"
            Even with `-servergamelog` active, there is a **2–5 second delay** between in-game events and them appearing in RSM. This is an Ark engine behaviour, not a RSM bug.

    ---

    ### 🔑 RCON Commands Fail or Return Errors {: .rsm-header }

    ??? failure "Commands do nothing or RSM shows an RCON connection error"

        Check the following in order:

        1. **`-RCONEnabled`** must be present in your Arguments. Without it, Ark's RCON listener never starts.
        2. The **RCON Port** in RSM must match the `-RCONPort=` value in your Arguments. Default is `27020`.
        3. The **Admin Password** in RSM must exactly match the `-ServerAdminPassword=` value in your Arguments — including capitalisation and special characters.
        4. Check that your security software (Windows Defender, antivirus) is not blocking the RCON port on `localhost`. Add an inbound rule for the port if needed.

    ---

    ### 💥 Server Crashes Immediately After Launch {: .rsm-header }

    ??? failure "ShooterGameServer.exe exits within seconds"

        The most common cause is an incorrect **Working Directory**. Ark's executable must be launched from the `Win64` folder because it needs to load sibling `.dll` files from that same directory.

        - Working Directory must be: `...\ShooterGame\Binaries\Win64`
        - **Not** the root Ark folder, and **not** `ShooterGame` — it must be `Win64` specifically.

    ---

    ### 🌐 Multiple Instances Conflict {: .rsm-header }

    ??? warning "Second Ark server crashes or can't be found by players"

        Each Ark instance needs three unique ports in its Arguments:

        | Argument | Default | Description |
        | :--- | :--- | :--- |
        | `-Port=` | `7777` | Main game connection port |
        | `-QueryPort=` | `27015` | Steam query port |
        | `-RCONPort=` | `27020` | RSM command port |

        Increment each by 1 (or any unused value) per additional instance. Also ensure each instance has a **unique Working Directory** so RSM can tell them apart.

    ---

    ### ⏳ Console is Blank for the First Minute {: .rsm-header }

    ??? info "No output during initial Ark startup — this is normal"

        When Ark boots, it loads "Primal Game Data" which can take **30–90 seconds** depending on your hardware and mods. No log lines are written during this phase. The RSM console will appear blank during this time. Wait for the loading phase to complete before assuming something is wrong.


=== ":material-leaf: Terraria"

    ### ⚡ Quick Actions Are Not Available {: .rsm-header }

    ??? info "No Quick Action buttons appear for Terraria"

        Terraria's dedicated server has **no RCON protocol and no HTTP API**. There is no programmatic way to send commands to a running Terraria server from an external process. This is a limitation of the game software itself.

        Terraria is managed through RSM for **process control only** (start, stop, monitor). To send in-game commands, you must interact with the server's console window directly if you have one open, or use an in-game admin account.

    ---

    ### ⚙️ Server Ignores Config or Starts With Wrong World {: .rsm-header }

    ??? warning "Terraria loads the wrong world or ignores config file"

        Terraria reads its configuration from the file specified by the `-config` argument. If this file path is wrong or uses a relative path that doesn't resolve from the Working Directory, Terraria falls back to defaults.

        - Use an **absolute path** for your config file: `-config "C:\Servers\Terraria\serverconfig.txt"`
        - Confirm the Working Directory in RSM is set to the folder containing `TerrariaServer.exe`.
        - Open `serverconfig.txt` and verify `world=` points to an existing `.wld` file.

    ---

    ### ⚠️ Port Conflict With Multiple Terraria Instances {: .rsm-header }

    ??? warning "Second Terraria server crashes or is unreachable"

        Each Terraria instance needs a unique port. Set this in your **Arguments** field:

        ```
        -config "C:\Servers\Terraria\serverconfig.txt" -port 7778 -players 8
        ```

        Default port is `7777`. Increment by 1 for each additional instance, and ensure each instance has a unique **Working Directory** in RSM.

    ---

    ### ⏱️ Server Starts Slowly — World Generation Takes Time {: .rsm-header }

    ??? info "RSM shows 'Starting' for a long time — this is normal for new worlds"

        If `serverconfig.txt` points to a world file that does not yet exist, Terraria will **generate a new world** before the server becomes joinable. This can take **1–3 minutes** for large worlds. RSM will show the server as **Starting** during this time. Once generation finishes, the status will update to **Online** automatically.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🧠 How RSM Works Internally</p>

Understanding these mechanics can help you diagnose unusual problems.

!!! info "PID Handoff & Heartbeat"
    When RSM starts a server it records the game process's **PID (Process ID)**. Every **5 seconds**, RSM checks whether that PID is still present in the Windows task list.

    * If the PID disappears (crash or manual close), RSM automatically triggers cleanup and sets the server to **Offline**.
    * If RSM itself is restarted while a server is running, the saved PID is discarded and all servers reset to **Offline** on load. RSM does not re-attach to previously running servers across restarts.

!!! info "Deep PID Search (PowerShell Bridge servers only)"
    Native `.exe` servers (SE, Ark, Terraria) are launched through a hidden PowerShell process. The game may briefly break the parent–child link during startup (e.g. Space Engineers re-launches itself). When this happens, RSM runs a **deep search** every 3 seconds using WMIC to find the game by EXE name and Working Directory path.

    If you see repeated `deep search` lines in the System Console and the server never goes Online, the Working Directory in RSM does not match what the game process is actually using. Double-check your `-path` or working directory arguments.

!!! info "Log Tailing (PowerShell Bridge servers only)"
    RSM does not capture stdout for bridge-mode servers. Instead it reads from the log file on disk, tracking the byte position between reads so it only processes new lines. This is why a correct **Log Path** is essential for these game types.

!!! warning "Firewall and Security Software"
    RSM uses PowerShell to launch and stop processes. Some antivirus products flag this behaviour. If servers fail to start without an obvious error, temporarily disable real-time protection to test. Add RSM and PowerShell to your antivirus exclusions if this resolves the issue.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">📋 Collecting Logs for a Bug Report</p>

If your issue is not listed here, collect the following before opening a ticket so the problem can be reproduced quickly.

<div class="grid cards" markdown>

-   :material-text-box-outline: **RSM System Console Output**

    ---

    Copy the full text from the **System Console** panel in RSM (bottom of the main window). This contains startup messages, PID search output, and any error replies from IPC handlers.

-   :material-folder-open: **RSM App Log**

    ---

    Located at: `C:\Users\<YourName>\AppData\Roaming\ronin-server-manager\`  
    Include any `.log` files from this directory.

-   :material-file-search: **Game Server Log**

    ---

    The log file RSM reads from disk (the path set in your **Log Path** field). Include the last 100 lines, or the full file if it is small.

-   :material-information-outline: **RSM Version**

    ---

    Visible in the title bar or About screen. Mention your Windows version and whether RSM is running as Administrator.

</div>

[Report an Issue on GitHub](https://github.com/PhonicSpider/Ronin-Server-Manager/issues){ .md-button .md-button--primary }

---

<p align="center">
  <i><b>Tip:</b> The System Console in RSM (the log panel at the bottom) is your best first diagnostic tool. Every start, stop, PID search, and command result is logged there in real time.</i>
</p>
