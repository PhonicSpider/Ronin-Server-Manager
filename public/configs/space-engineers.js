export const spaceEngineers = {
    meta: {
        displayName: "Space Engineers",
        icon: "logos/seLogo.png"
    },
    backend: {
        category: "POWERSHELL_BRIDGE"
    },
    gameFiles: {
        configs: [
            { label: "Dedicated Config", file: "SpaceEngineers-Dedicated.cfg" },
        ]
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
        portId: "API Port",
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
    },
    quickActions: [
        { label: 'Save World',     command: '\\save' },
        { label: 'Server Status',  command: '\\status' },
        { label: 'List Players',   command: '\\players' },
    ]
};