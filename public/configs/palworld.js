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
        // Not yet verified against a real log file -- add patterns here once
        // someone's actually run this server and seen what's noisy.
        logNoisePatterns: [],
        // How RSM asks this game to save and quit before closing the process.
        // REST: POST /v1/api/save then POST /v1/api/shutdown (short countdown + broadcast).
        gracefulStop: { transport: 'palworld-rest', commands: [], timeoutSeconds: 60 },
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
        customArgs: 'EpicApp=PalServer -port=8211',
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
        { id: 'game', label: 'Game Port', default: 8211, tcp: false, udp: true, description: 'Player connections' },
        { id: 'query', label: 'Query Port', default: 27015, tcp: false, udp: true, description: 'Community server browser (optional)' },
        { id: 'restapi', label: 'REST API Port', default: 8212, tcp: false, udp: false, description: 'REST API, used by RSM for player count and shutdown -- closed by default -- RSM reaches it over localhost; never expose it to the internet' },
    ],
    quickActions: [],
    parseForRsm(fileContentsMap) {
        const content = fileContentsMap['PalWorldSettings.ini'] || '';
        function parsePalOpt(key) {
            const match = content.match(new RegExp(`${key}=(?:"([^"]*?)"|([^,)]+))`));
            if (!match) return null;
            return (match[1] !== undefined ? match[1] : match[2] || '').trim();
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
