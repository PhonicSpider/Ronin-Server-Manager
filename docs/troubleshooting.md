# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🛠️ Troubleshooting & FAQ</p>

If your server isn't starting or the console is behaving unexpectedly, check these common solutions.

---

##  <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🔍 Common Issues</p>

<div class="grid cards" markdown>

-   :material-sync-alert: **Server Already "Active"**

    ---

    **Issue:** RSM shows "Active" but you didn't start the server.
    
    **Fix:** RSM uses **PID Handoff**. It found a running process from a previous session. Click **Force Stop** if the ID is incorrect.

-   :material-console-off: **Blank Console Window**

    ---

    **Issue:** The server is running, but no text appears in RSM.
    
    **Fix:** * **MC:** Ensure `-nogui` is in arguments.
    * **SE:** Ensure `-console` is in arguments.
    * **Admin:** Try running RSM as Administrator.

-   :material-ethernet-alert: **Port Binding Error**

    ---

    **Issue:** "Port 25565 already in use" in logs.
    
    **Fix:** A ghost process is holding the port. Kill `java.exe` in Task Manager or use `netstat -ano` in PowerShell to find the culprit.

-   :material-account-shield: **Permission Denied**

    ---

    **Issue:** Server fails to write logs or save world.
    
    **Fix:** Ensure RSM has Write access to the server's Root Directory. Running from `C:\Program Files\` often requires Admin rights.

</div>

---

##  <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🧠 Advanced Technical Info</p>

!!! info "How PID Handoff Works"
    Unlike simple batch files, RSM saves the **Process ID (PID)** to a local database. 
    1. When you click **Start**, RSM records the ID.
    2. If RSM crashes or is closed, the server keeps running.
    3. Upon restart, RSM "scans" for that ID. If it's still alive, it re-attaches the controls instantly.

!!! warning "Memory Leaks"
    If your RAM usage bars in RSM are hitting **90%+**, the manager may struggle to capture logs. Always ensure you leave at least 1-2GB of "Headroom" for the Windows OS to breathe.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">📥 Still Need Help?</p>
If your issue isn't listed here, please collect your logs from the `appdata/roaming/RSM/logs` folder and open a ticket.

[Report an Issue (WIP)](your-github-link){ .md-button }
[Join the Community (WIP)](your-discord-link){ .md-button }