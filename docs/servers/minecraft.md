# :material-minecraft: Minecraft (Java Edition)

Minecraft runs inside a **Java Virtual Machine**. RSM needs the direct path to your `java.exe` to ensure console capture and version stability.

### <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">☕ Identifying your Java Path</p>

=== ":material-folder-search: Manual Method"
    1.  **Locate Installation:** Usually in `C:\Program Files\Java\`.
    2.  **Find the Bin:** Open your version folder (e.g., `jdk-21`) and open the `bin` folder.
    3.  **Copy Path:** Right-click `java.exe` and select **"Copy as path"**.

=== ":material-console: Log Method"
    1.  Run your server manually once.
    2.  Look for a log line like: `installed at C:\Program Files\Java\jdk-21\bin\java.exe`
    3.  Copy that exact path into the RSM **Path** field.

### ⚙️ Startup Arguments
To run Minecraft, you point to the **Java executable**, not the `.jar` file.

* **Path:** Use your `java.exe` path found in the steps above.
* **Arguments:** `-Xmx4G -Xms2G -jar server.jar nogui`
    * `nogui`: **Required.** RSM needs this to capture console output.
    * `-Xmx4G`: Allocates 4GB of Max RAM.

!!! tip "Pro-Tip: Isolated Java"
    If you use **CurseForge** or **Prism**, they download "Isolated" Java versions. Check their settings for these paths to ensure perfect mod compatibility.