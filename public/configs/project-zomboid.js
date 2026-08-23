// Project Zomboid stores its config in %USERPROFILE%\Zomboid\Server\ after first run.
// All essential settings are passed as launch arguments.
export const projectZomboid = {
    meta: {
        displayName: 'Project Zomboid',
        icon: 'logos/pzLogo.png',
    },
    forge: {
        appId: '380870',
        relExe: 'ProjectZomboidServer.bat',
    },
    backend: {
        category: 'DIRECT_CONSOLE',
        // Project Zomboid is unusual: it's DIRECT_CONSOLE (launched with a
        // real stdin pipe, which Quick Actions already use) but ALSO exposes
        // a genuine Source RCON server on its own port -- RCON availability
        // here doesn't depend on the launch mechanism. get-player-count's
        // generic RCON dispatch (main.js) was previously gated to
        // POWERSHELL_BRIDGE only, which silently excluded this game; that
        // gate is now just "does this server have RCON creds", so this
        // works.
        playerListCommand: 'players',
        // Not consumed today -- Project Zomboid is DIRECT_CONSOLE
        // (stdin/stdout piped directly), not file-tailed. Kept for
        // config-schema consistency.
        logNoisePatterns: [],
    },
    label: 'SERVER BATCH FILE (ProjectZomboidServer.bat)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'block',
        portPass: 'block',
    },
    defaults: {
        newName: 'e.g. Project Zomboid - Knox County',
        exePath: '...\\ProjectZomboidServer.bat',
        workingDir: 'C:\\Servers\\ProjectZomboid',
        customArgs: '-servername "pzserver" -adminpassword "changeme" -port 16261 -rcon.port 27015 -rcon.password "changeme"',
        portId: 'RCON Port',
        portPass: 'RCON Password',
    },
    varInputs: {
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        customArgs: 'value',
        portId: 'placeholder',
        portPass: 'placeholder',
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
