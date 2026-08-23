export const terraria = {
    meta: {
        displayName: 'Terraria',
        icon: 'logos/trLogo.png',
    },
    forge: {
        appId: '105600',
        relExe: 'TerrariaServer.exe',
    },
    backend: {
        category: 'DIRECT_CONSOLE',
        playerListCommand: 'playing',
        // Not consumed today -- Terraria is DIRECT_CONSOLE (stdin/stdout
        // piped directly), not file-tailed. Kept for config-schema consistency.
        logNoisePatterns: [],
    },
    gameFiles: {
        configs: [
            { label: 'Server Config', file: 'serverconfig.txt' },
        ],
    },
    label: 'SERVER EXECUTABLE (TerrariaServer.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'none',
        portPass: 'none',
    },
    defaults: {
        newName: 'e.g. Terraria Expert World',
        exePath: 'C:\\Servers\\Terraria\\TerrariaServer.exe',
        workingDir: 'C:\\Servers\\Terraria',
        customArgs: '-config serverconfig.txt -port 7777 -players 8',
    },
    varInputs: {
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        customArgs: 'value',
    },
    firewallPorts: [
        { id: 'game', label: 'Game Port', default: 7777, tcp: true, udp: false, description: 'Player connections' },
    ],
    quickActions: [
        { label: 'List Players', command: 'playing' },
        { label: 'Save World',   command: 'save' },
    ],
    parseForRsm(fileContentsMap) {
        const content = fileContentsMap['serverconfig.txt'] || '';
        function parseProp(key) {
            const m = content.match(new RegExp(`^\\s*${key}\\s*=?\\s*(.*)$`, 'm'));
            return m ? m[1].trim() : null;
        }
        const port = parseProp('port') || '7777';
        return {
            args: `-config serverconfig.txt -port ${port} -players 8`,
            apiPort: '',
            apiPass: '',
            logPath: '',
        };
    },
};
