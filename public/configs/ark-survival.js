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
        newName: "e.g. Ark - Island Survival",
        exePath: "C:\\Servers\\Ark\\ShooterGame\\Binaries\\Win64\\ShooterGameServer.exe",
        workingDir: "C:\\Servers\\Ark",
        customArgs: "?listen?SessionName=RoninServer -RCONEnabled -RCONPort=27020 -ServerAdminPassword= -NoBattlEye -servergamelog",
        logPath: "C:\\Path\\To\\log\\Folder",
        portId: "RCON Port",
        portPass: "RCON Password"
    },
    varInputs: { // Determine whether defaults will be placeholders or values
        newName: "placeholder",
        exePath: "placeholder",
        workingDir: "placeholder",
        customArgs: "value",
        logPath: "placeholder",
        portId: "placeholder",
        portPass: "placeholder"
    }
};