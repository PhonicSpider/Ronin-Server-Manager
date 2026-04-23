export const ark = {
    meta: {
        displayName: "Ark: Survival",
        icon: "logos/arksLogo.png"
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
        customArgs: "?listen?SessionName=RoninServer -RCONEnabled -RCONPort=27020 -ServerAdminPassword=ronin -NoBattlEye",
        logPath: "C:\\Path\\To\\log\\Folder",
        portID: "RCON Port",
        portPass: "RCON Password"
    },
    varInputs: { // Determine whether defaults will be placeholders or values
        customArgs: "value",
        logPath: "placeholder",
        portID: "placeholder",
        portPass: "placeholder"
    }
};