export const palworld = {
    meta: {
        displayName: 'Palworld',
        icon: 'logos/palworldLogo.png',
    },
    forge: {
        appId: '2394010',
        relExe: 'PalServer.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        // Palworld's RCON is officially deprecated and scheduled for removal
        // (per docs.palworldgame.com); Pocketpair's recommended replacement is
        // the REST API, which RSM uses directly for player-count (see the
        // dedicated 'palworld' branch in get-player-count in main.js) rather
        // than the generic RCON dispatch this field would otherwise drive.
        playerListCommand: null,
    },
    gameFiles: {
        configPath: 'Pal\\Saved\\Config\\WindowsServer',
        configs: [
            { label: 'PalWorldSettings.ini', file: 'PalWorldSettings.ini' },
        ],
    },
    label: 'SERVER EXECUTABLE (PalServer.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        // Palworld does not write a log file by default (confirmed -- no
        // Pal\Saved\Logs folder exists unless an external wrapper script
        // creates one). Left hidden rather than pointing at a path that will
        // never exist; see the Palworld doc page for the manual workaround.
        log: 'none',
        port: 'block',
        portPass: 'block',
    },
    defaults: {
        newName: 'e.g. Palworld - Pal Paradise',
        exePath: '...\\PalServer.exe',
        workingDir: 'C:\\Servers\\Palworld',
        customArgs: 'EpicApp=PalServer -port=8211 -RCONPort=25575',
        // REST API, not RCON -- RSM's player-count uses this port/password pair
        // against Palworld's REST API (default 8212), not the deprecated RCON
        // port (25575, still listed separately in Firewall Ports below).
        portId: 'REST API Port',
        portPass: 'Admin Password',
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
        { id: 'game',    label: 'Game Port',     default: 8211,  tcp: false, udp: true,  description: 'Player connections' },
        { id: 'restapi', label: 'REST API Port', default: 8212,  tcp: true,  udp: false, description: 'Player count & admin (used by RSM)' },
        { id: 'rcon',    label: 'RCON Port',     default: 25575, tcp: true,  udp: false, description: 'Deprecated by Palworld -- not used by RSM' },
    ],
    quickActions: [],
    parseForRsm(fileContentsMap) {
        const content = fileContentsMap['PalWorldSettings.ini'] || '';
        function parsePalOpt(key) {
            const m = content.match(new RegExp(`${key}=(?:"([^"]*?)"|([^,)]+))`));
            if (!m) return null;
            return (m[1] !== undefined ? m[1] : m[2] || '').trim();
        }
        // RSM reads the REST API port/password, not RCON's -- see the comments
        // on backend.playerListCommand and defaults.portId above.
        const apiPort  = parsePalOpt('RESTAPIPort')   || '8212';
        const apiPass  = parsePalOpt('AdminPassword') || '';
        const gamePort = parsePalOpt('PublicPort')    || '8211';
        return {
            args: `EpicApp=PalServer -port=${gamePort} -RCONPort=25575`,
            apiPort,
            apiPass,
            logPath: '',
        };
    },
};
