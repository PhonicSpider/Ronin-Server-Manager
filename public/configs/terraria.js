export const terraria = {
    meta: {
        displayName: "Terraria",
        icon: "logos/trLogo.png"
    },
    backend: {
        category: "POWERSHELL_BRIDGE"
    },
    label: "SERVER EXECUTABLE (TerrariaServer.exe)",
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'none',
        portPass: 'none'
    },
    defaults: {
        newName: "e.g. Terraria Expert World",
        exePath: "C:\\Servers\\Terraria\\TerrariaServer.exe",
        workingDir: "C:\\Servers\\Terraria",
        customArgs: "-config serverconfig.txt -port 7777 -players 8"
    }
    varInputs: { // Determine whether defaults will be placeholders or values
        newName: "placeholder",
        exePath: "placeholder",
        workingDir: "placeholder",
        customArgs: "value"
    }
};