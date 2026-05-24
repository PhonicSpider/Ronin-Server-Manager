export const minecraft = {
    meta: {
        displayName: "Minecraft",
        icon: "logos/mcLogo.png"
    },
    backend: {
        category: "DIRECT_CONSOLE"
    },
    gameFiles: {
        configs: [
            { label: "Server Properties", file: "server.properties" },
            { label: "Ops List",          file: "ops.json" },
        ]
    },
    label: "JAVA EXECUTABLE (javaw.exe)",
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'none',
        portPass: 'none'
    },
    defaults: {
        newName: "e.g. Minecraft Survival Hub",
        exePath: "C:\\Program Files\\Java\\...\\java.exe",
        workingDir: "C:\\Servers\\Minecraft_Server",
        customArgs: "-Xmx4G -Xms2G -jar server.jar nogui"
    },
    varInputs: { // Determine whether defaults will be placeholders or values
        newName: "placeholder",
        exePath: "placeholder",
        workingDir: "placeholder",
        customArgs: "value"
    },
    firewallPorts: [
        { id: 'game', label: 'Game Port', default: 25565, tcp: true,  udp: true,  description: 'Player connections' },
        { id: 'rcon', label: 'RCON',      default: 25575, tcp: true,  udp: false, description: 'Remote admin console' },
    ],
    quickActions: [
        { label: 'List Players', command: 'list' },
        { label: 'Save World',   command: 'save-all' },
        { label: 'Set Day',      command: 'time set day' },
        { label: 'Clear Weather', command: 'weather clear' },
    ]
};