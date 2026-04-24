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
        executable: 'block',
        workingDir: 'block',
        logPath: 'block',    // Essential for POWERSHELL_BRIDGE
        apiPort: 'block',    // Usually for RCON
        apiPass: 'block',    // be sure there is one
        customArgs: 'block'
    },
    defaults: { // Optional placeholders if blocks are enabled, can set any block placeholder or value here
        customArgs: "?listen?SessionName=RoninServer -RCONEnabled -RCONPort=27020 -ServerAdminPassword=ronin -NoBattlEye -servergamelog",
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