export const conanExiles = {
    meta: {
        displayName: 'Conan Exiles',
        icon: '🗡',
    },
    forge: {
        appId: '443030',
        relExe: 'ConanSandbox\\Binaries\\Win64\\ConanSandboxServer-Win64-Shipping.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        playerListCommand: null,
    },
    gameFiles: {
        configPath: 'ConanSandbox\\Saved\\Config\\WindowsServer',
        configs: [
            { label: 'Engine.ini',           file: 'Engine.ini' },
            { label: 'ServerSettings.ini',   file: 'ServerSettings.ini' },
        ],
    },
    label: 'SERVER EXECUTABLE (ConanSandboxServer-Win64-Shipping.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'block',
        portPass: 'block',
    },
    defaults: {
        newName: 'e.g. Conan Exiles - The Exiled Lands',
        exePath: '...\\ConanSandbox\\Binaries\\Win64\\ConanSandboxServer-Win64-Shipping.exe',
        workingDir: 'C:\\Servers\\ConanExiles',
        customArgs: '/Game/Maps/ConanSandbox/ConanSandbox -log -Port=7777',
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
        { id: 'game', label: 'Game Port', default: 7777,  tcp: true,  udp: true,  description: 'Player connections' },
        { id: 'peer', label: 'Peer Port', default: 7778,  tcp: true,  udp: true,  description: 'Peer-to-peer' },
        { id: 'rcon', label: 'RCON',      default: 25575, tcp: true,  udp: false, description: 'Admin console (RCON)' },
    ],
    quickActions: [
        { label: 'List Players', command: 'ListPlayers' },
        { label: 'Save World',   command: 'SaveWorld' },
    ],
    parseForRsm(fileContentsMap) {
        const content = fileContentsMap['Engine.ini'] || '';
        function parseIni(section, key) {
            const secM = content.match(new RegExp(`\\[${section.replace(/\//g, '\\/')}\\]([\\s\\S]*?)(?=\\[|$)`, 'i'));
            if (!secM) return null;
            const m = secM[1].match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm'));
            return m ? m[1].trim() : null;
        }
        const apiPort  = parseIni('RCONPlugin', 'RCONPort')     || '25575';
        const apiPass  = parseIni('RCONPlugin', 'RCONPassword') || '';
        const gamePort = parseIni('URL', 'Port')                || '7777';
        return {
            args: `/Game/Maps/ConanSandbox/ConanSandbox -log -Port=${gamePort}`,
            apiPort,
            apiPass,
            logPath: '',
        };
    },
};
