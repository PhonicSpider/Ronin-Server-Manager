export const spaceEngineers = {
    meta: {
        displayName: "Space Engineers",
        icon: "logos/seLogo.png"
    },
    backend: {
        category: "POWERSHELL_BRIDGE"
    },
    label: "SERVER EXECUTABLE (.exe)",
    blocks: {
        path: 'block',
        workingDir: 'block',
        log: 'block',
        port: 'block',
        portPass: 'block',
        args: 'block'
    },
    defaults: {
        newName: "e.g. SE - Orion Sector",
        exePath: "...\\DedicatedServer64\\SpaceEngineersDedicated.exe",
        workingDir: "C:\\ProgramData\\SpaceEngineersDedicated\\Instance",
        logPath: "Select SpaceEngineersDedicated.log location...",
        portId: "8080",
        portPass: "API Password",
        customArgs: "-console -ignorelastsession"
    },
    varInputs: { // Determine whether defaults will be placeholders or values
        newName: "placeholder",
        exePath: "placeholder",
        workingDir: "placeholder",
        logPath: "placeholder",
        portId: "placeholder",
        portPass: "placeholder",
        customArgs: "value"
    }
};