# :material-rocket-launch: Space Engineers

Space Engineers runs as a native Windows executable. Unlike Java games, it points directly to the game binary.

### 🔍 Executable Path
Point RSM directly to the dedicated server binary:
`.../DedicatedServer64/SpaceEngineersDedicated.exe`

### ⚙️ Startup Arguments
These flags are required to ensure RSM can monitor the process correctly.

* **Arguments:** `-console -ignorelastsession -path "your_instance_folder"`
    * `-console`: Enables the console output for RSM logging.
    * `-ignorelastsession`: Skips "unclean shutdown" prompts.
    * `-path`: Defines your custom world/instance storage location.

---

!!! warning "Admin Rights"
    Space Engineers often requires **Administrative privileges** to bind to network ports. Ensure the user running RSM is an Administrator.