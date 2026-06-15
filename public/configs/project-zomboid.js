// Project Zomboid stores its config in %USERPROFILE%\Zomboid\Server\ after first run.
// All essential settings are passed as launch arguments.
export const projectZomboid = {
    meta: {
        displayName: 'Project Zomboid',
        icon: '🧠',
    },
    forge: {
        appId: '380870',
        relExe: 'ProjectZomboidServer.bat',
    },
    backend: {
        category: 'DIRECT_CONSOLE',
        playerListCommand: 'players',
    },
    label: 'SERVER BATCH FILE (ProjectZomboidServer.bat)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'none',
        portPass: 'none',
    },
    defaults: {
        newName: 'e.g. Project Zomboid - Knox County',
        exePath: '...\\ProjectZomboidServer.bat',
        workingDir: 'C:\\Servers\\ProjectZomboid',
        customArgs: '-servername "pzserver" -adminpassword "changeme" -port 16261 -rcon.port 27015 -rcon.password "changeme"',
    },
    varInputs: {
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        customArgs: 'value',
    },
    firewallPorts: [
        { id: 'game', label: 'Game Port', default: 16261, tcp: true, udp: true,  description: 'Player connections' },
        { id: 'rcon', label: 'RCON',      default: 27015, tcp: true, udp: false, description: 'Admin console (RCON)' },
    ],
    quickActions: [
        { label: 'List Players', command: 'players' },
        { label: 'Save',         command: 'save' },
    ],
};
