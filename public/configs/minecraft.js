export const minecraft = {
    meta: {
        displayName: "Minecraft",
        icon: "logos/mcLogo.png"
    },
    backend: {
        category: "DIRECT_CONSOLE"
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
    }
};