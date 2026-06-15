export const vRising = {
    meta: {
        displayName: 'V Rising',
        icon: '🧛',
    },
    forge: {
        appId: '1829350',
        relExe: 'VRisingServer.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        playerListCommand: null,
    },
    gameFiles: {
        configPath: 'VRisingServer_Data\\StreamingAssets\\Settings',
        configs: [
            { label: 'ServerHostSettings.json',  file: 'ServerHostSettings.json' },
            { label: 'ServerGameSettings.json',  file: 'ServerGameSettings.json' },
        ],
    },
    label: 'SERVER EXECUTABLE (VRisingServer.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'block',
        portPass: 'block',
    },
    defaults: {
        newName: 'e.g. V Rising - Cursed Lands',
        exePath: '...\\VRisingServer.exe',
        workingDir: 'C:\\Servers\\VRising',
        customArgs: '-persistentDataPath "." -serverPort 9876 -rconEnabled -rconPort 25575',
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
        { id: 'game',  label: 'Game Port',  default: 9876,  tcp: false, udp: true,  description: 'Player connections' },
        { id: 'query', label: 'Query Port', default: 9877,  tcp: false, udp: true,  description: 'Steam server browser' },
        { id: 'rcon',  label: 'RCON',       default: 25575, tcp: true,  udp: false, description: 'Admin console (RCON)' },
    ],
    quickActions: [],
    parseForRsm(fileContentsMap, { installDir }) {
        const content = fileContentsMap['ServerHostSettings.json'] || '{}';
        let cfg = {};
        try { cfg = JSON.parse(content); } catch {}
        const rcon    = cfg.Rcon || {};
        const apiPort = String(rcon.Port     || 25575);
        const apiPass = String(rcon.Password || '');
        const gamePort = String(cfg.Port     || 9876);
        return {
            args: `-persistentDataPath "${installDir}" -serverPort ${gamePort} -rconEnabled -rconPort ${apiPort}`,
            apiPort,
            apiPass,
            logPath: '',
        };
    },
};
