export const ark = {
    meta: {
        displayName: 'ARK: Survival Evolved',
        icon: 'logos/arksLogo.png',
    },
    forge: {
        appId: '376030',
        relExe: 'ShooterGame\\Binaries\\Win64\\ShooterGameServer.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        playerListCommand: 'ListPlayers',
        // Not yet verified against a real log file -- add patterns here once
        // someone's actually run this server and seen what's noisy.
        logNoisePatterns: [],
    },
    gameFiles: {
        configPath: 'ShooterGame\\Saved\\Config\\WindowsServer',
        configs: [
            { label: 'Game User Settings', file: 'GameUserSettings.ini' },
            { label: 'Game Settings',      file: 'Game.ini' },
        ],
    },
    label: 'ARK SERVER EXECUTABLE (ShooterGameServer.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        log: 'block',
        port: 'block',
        portPass: 'block',
        args: 'block',
    },
    defaults: {
        newName: 'e.g. Ark - Island Survival',
        exePath: 'C:\\Servers\\Ark\\ShooterGame\\Binaries\\Win64\\ShooterGameServer.exe',
        workingDir: 'C:\\Servers\\Ark\\ShooterGame',
        customArgs: 'TheIsland?listen?SessionName=RoninServer -RCONEnabled -RCONPort=27020 -ServerAdminPassword= -NoBattlEye -servergamelog',
        logPath: 'C:\\Path\\To\\log\\Folder',
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
        { id: 'game',  label: 'Game Port',  default: 7777,  tcp: false, udp: true,  description: 'Player connections' },
        { id: 'query', label: 'Query Port', default: 27015, tcp: false, udp: true,  description: 'Steam server browser' },
        { id: 'rcon',  label: 'RCON',       default: 27020, tcp: true,  udp: false, description: 'Admin console (RCON)' },
    ],
    quickActions: [
        { label: 'List Players',       command: 'ListPlayers' },
        { label: 'Save World',         command: 'SaveWorld' },
        { label: 'Destroy Wild Dinos', command: 'DestroyWildDinos' },
    ],
    parseForRsm(fileContentsMap) {
        const content = fileContentsMap['GameUserSettings.ini'] || '';
        function parseIni(section, key) {
            const secM = content.match(new RegExp(`\\[${section}\\]([\\s\\S]*?)(?=\\[|$)`));
            if (!secM) return null;
            const m = secM[1].match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm'));
            return m ? m[1].trim() : null;
        }
        const apiPass = parseIni('ServerSettings', 'ServerAdminPassword') || '';
        const apiPort = parseIni('ServerSettings', 'RCONPort')            || '27020';
        return {
            args: `TheIsland?listen?RCONEnabled=True?RCONPort=${apiPort}?ServerAdminPassword=${apiPass} -server -log`,
            apiPort,
            apiPass,
            logPath: '',
        };
    },
};
