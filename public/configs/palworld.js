export const palworld = {
    meta: {
        displayName: 'Palworld',
        icon: '🐾',
    },
    forge: {
        appId: '2394010',
        relExe: 'PalServer.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
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
        log: 'none',
        port: 'block',
        portPass: 'block',
    },
    defaults: {
        newName: 'e.g. Palworld - Pal Paradise',
        exePath: '...\\PalServer.exe',
        workingDir: 'C:\\Servers\\Palworld',
        customArgs: 'EpicApp=PalServer -port=8211 -RCONPort=25575',
        portId: 'RCON Port',
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
        { id: 'game', label: 'Game Port', default: 8211,  tcp: false, udp: true,  description: 'Player connections' },
        { id: 'rcon', label: 'RCON Port', default: 25575, tcp: true,  udp: false, description: 'Admin console (RCON)' },
    ],
    quickActions: [],
    parseForRsm(fileContentsMap) {
        const content = fileContentsMap['PalWorldSettings.ini'] || '';
        function parsePalOpt(key) {
            const m = content.match(new RegExp(`${key}=(?:"([^"]*?)"|([^,)]+))`));
            if (!m) return null;
            return (m[1] !== undefined ? m[1] : m[2] || '').trim();
        }
        const apiPort  = parsePalOpt('RCONPort')     || '25575';
        const apiPass  = parsePalOpt('AdminPassword') || '';
        const gamePort = parsePalOpt('PublicPort')    || '8211';
        return {
            args: `EpicApp=PalServer -port=${gamePort} -RCONPort=${apiPort}`,
            apiPort,
            apiPass,
            logPath: '',
        };
    },
};
