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
        path: 'block',
        workingDir: 'block',
        log: 'block',      // Changed from logPath to log
        port: 'block',     // Changed from apiPort to port
        portPass: 'block', // Changed from apiPass to portPass
        args: 'block'      // Changed from customArgs to args
    },
    defaults: { // Optional placeholders if blocks are enabled, can set any block placeholder or value here
        exePath: "C:\\Path\\To\\Executable",
        customArgs: "?listen?SessionName=RoninServer -RCONEnabled -RCONPort=27020 -ServerAdminPassword=ronin -NoBattlEye -servergamelog",
        logPath: "C:\\Path\\To\\log\\Folder",
        portId: "RCON Port",
        portPass: "RCON Password"
    },
    varInputs: { // Determine whether defaults will be placeholders or values
        customArgs: "value",
        logPath: "placeholder",
        portId: "placeholder",
        portPass: "placeholder"
    }
};