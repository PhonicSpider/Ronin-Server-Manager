export const arkSurvivalAscended = {
    meta: {
        displayName: 'ARK: Survival Ascended',
        icon: '🦕',
    },
    forge: {
        appId: '2430930',
        relExe: 'ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        playerListCommand: null,
    },
    gameFiles: {
        configPath: 'ShooterGame\\Saved\\Config\\WindowsServer',
        configs: [
            { label: 'GameUserSettings.ini', file: 'GameUserSettings.ini' },
            { label: 'Game.ini',             file: 'Game.ini' },
        ],
    },
    label: 'SERVER EXECUTABLE (ArkAscendedServer.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'block',
        portPass: 'block',
    },
    defaults: {
        newName: 'e.g. ARK ASA - The Island',
        exePath: '...\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe',
        workingDir: 'C:\\Servers\\ARK-ASA',
        customArgs: 'TheIsland_WP?listen?RCONEnabled=True?RCONPort=27020?ServerAdminPassword=changeme -server -log',
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
        { id: 'game',  label: 'Game Port',  default: 7777,  tcp: true,  udp: true,  description: 'Player connections' },
        { id: 'query', label: 'Query Port', default: 27015, tcp: false, udp: true,  description: 'Steam server browser' },
        { id: 'rcon',  label: 'RCON Port',  default: 27020, tcp: true,  udp: false, description: 'Admin console (RCON)' },
    ],
    quickActions: [
        { label: 'List Players', command: 'ListPlayers' },
        { label: 'Save World',   command: 'SaveWorld' },
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
        const apiPort = parseIni('ServerSettings', 'RCONPort') || '27020';
        return {
            args: `TheIsland_WP?listen?RCONEnabled=True?RCONPort=${apiPort}?ServerAdminPassword=${apiPass} -server -log`,
            apiPort,
            apiPass,
            logPath: '',
        };
    },
};
