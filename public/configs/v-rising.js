export const vRising = {
    meta: {
        displayName: 'V Rising',
        icon: 'logos/vRisingLogo.png',
    },
    forge: {
        appId: '1829350',
        relExe: 'VRisingServer.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        // V Rising's RCON is a deliberately minimal server-management set
        // (announce, shutdown, name, password, version, time) -- there is no
        // player-list command. Player listing only works via the in-game
        // console (`listusers` after `adminauth`), which RSM has no access to.
        // Confirmed against GameServerKings' RCON command reference.
        playerListCommand: null,
        // Not yet verified against a real log file -- add patterns here once
        // someone's actually run this server and seen what's noisy.
        logNoisePatterns: [],
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
        log: 'block',
        port: 'block',
        portPass: 'block',
    },
    defaults: {
        newName: 'e.g. V Rising - Cursed Lands',
        exePath: '...\\VRisingServer.exe',
        workingDir: 'C:\\Servers\\VRising',
        // -logFile is required -- V Rising does not write a log file at all
        // unless explicitly told to (unlike Ark/Conan, which log by default).
        customArgs: '-persistentDataPath "." -serverPort 9876 -rconEnabled -rconPort 25575 -logFile ".\\logs\\VRisingServer.log"',
        logPath: 'C:\\Path\\To\\VRising\\logs\\VRisingServer.log',
        portId: 'RCON Port',
        portPass: 'RCON Password',
    },
    varInputs: {
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        customArgs: 'value',
        logPath: 'placeholder',
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
        const logPath = installDir ? `${installDir}\\logs\\VRisingServer.log` : '';
        return {
            args: `-persistentDataPath "${installDir}" -serverPort ${gamePort} -rconEnabled -rconPort ${apiPort} -logFile "${logPath}"`,
            apiPort,
            apiPass,
            logPath,
        };
    },
};
