export const enshrouded = {
    meta: {
        displayName: 'Enshrouded',
        icon: '🌫',
    },
    forge: {
        appId: '2278520',
        relExe: 'enshrouded_server.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        playerListCommand: null,
    },
    gameFiles: {
        configs: [
            { label: 'enshrouded_server.json', file: 'enshrouded_server.json' },
        ],
    },
    label: 'SERVER EXECUTABLE (enshrouded_server.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'none',
        log: 'none',
        port: 'block',
        portPass: 'block',
    },
    defaults: {
        newName: 'e.g. Enshrouded - Emberveil',
        exePath: '...\\enshrouded_server.exe',
        workingDir: 'C:\\Servers\\Enshrouded',
        customArgs: '',
        portId: 'Game Port',
        portPass: 'Server Password',
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
        { id: 'game',  label: 'Game Port',  default: 15636, tcp: false, udp: true, description: 'Player connections' },
        { id: 'query', label: 'Query Port', default: 15637, tcp: false, udp: true, description: 'Steam server browser' },
    ],
    quickActions: [],
    parseForRsm(fileContentsMap) {
        const content = fileContentsMap['enshrouded_server.json'] || '{}';
        let cfg = {};
        try { cfg = JSON.parse(content); } catch {}
        return {
            args: '',
            apiPort: String(cfg.gamePort || 15636),
            apiPass: String(cfg.password || ''),
            logPath: '',
        };
    },
};
