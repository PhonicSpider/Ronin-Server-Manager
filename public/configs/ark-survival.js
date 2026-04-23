export const ark = {
    meta: {
        displayName: "Ark: Survival",
        icon: "assets/logos/arkLogo.png"
    },
    backend: {
        category: "POWERSHELL_BRIDGE"
    },
    label: "ARK SERVER EXECUTABLE (ShooterGameServer.exe)",
    blocks: {
        executable: true,
        workingDir: true,
        logPath: true,    // Essential for POWERSHELL_BRIDGE
        apiPort: true,    // Usually for RCON
        apiPass: true,    // be sure there is one
        customArgs: true
    },
    defaults: {
        args: "TheIsland?listen?SessionName=RoninServer -NoBattlEye",
        port: "27015",
        logPath: "C:\\Path\\To\\log\\Folder",
        portID: "RCON Port",
        portPass: "RCON Password"
    }
};