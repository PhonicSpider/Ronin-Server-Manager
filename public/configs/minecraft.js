export const minecraft = {
    meta: {
        displayName: 'Minecraft',
        icon: 'logos/mcLogo.png',
    },
    forge: {
        appId: null,
        requiresExternalExe: true,
        exeLabel: 'Java Executable (javaw.exe or java.exe)',
    },
    backend: {
        category: 'DIRECT_CONSOLE',
        playerListCommand: 'list',
        // Not consumed today -- Minecraft is DIRECT_CONSOLE (stdin/stdout
        // piped directly), not file-tailed. Kept for config-schema consistency.
        logNoisePatterns: [],
        // How RSM asks this game to save and quit before closing the process.
        // Java console: save-all flushes the world, stop saves and exits.
        gracefulStop: { transport: 'stdin', commands: ['save-all', 'stop'], timeoutSeconds: 60 },
    },
    gameFiles: {
        configs: [
            { label: 'Server Properties', file: 'server.properties' },
            { label: 'Ops List',          file: 'ops.json' },
        ],
    },
    label: 'JAVA EXECUTABLE (javaw.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'none',
        portPass: 'none',
    },
    defaults: {
        newName: 'e.g. Minecraft Survival Hub',
        exePath: 'C:\\Program Files\\Java\\...\\java.exe',
        workingDir: 'C:\\Servers\\Minecraft_Server',
        customArgs: '-Xmx4G -Xms2G -jar server.jar nogui',
    },
    varInputs: {
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        customArgs: 'value',
    },
    firewallPorts: [
        { id: 'game', label: 'Game Port', default: 25565, tcp: true, udp: false, description: 'Player connections' },
        { id: 'rcon', label: 'RCON', default: 25575, tcp: false, udp: false, description: 'Remote admin console -- closed by default -- RSM reaches it over localhost' },
    ],
    quickActions: [
        { label: 'List Players',  command: 'list' },
        { label: 'Save World',    command: 'save-all' },
        { label: 'Set Day',       command: 'time set day' },
        { label: 'Clear Weather', command: 'weather clear' },
    ],
    parseForRsm(fileContentsMap, { exePath }) {
        const content = fileContentsMap['server.properties'] || '';
        function parseProp(key) {
            const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm'));
            return match ? match[1].trim() : null;
        }
        const apiPort = parseProp('rcon\\.port')     || '25575';
        const apiPass = parseProp('rcon\\.password') || '';
        return {
            args: exePath ? `-Xmx4G -Xms4G -jar server.jar nogui` : '-Xmx4G -Xms4G -jar server.jar nogui',
            apiPort,
            apiPass,
            logPath: '',
        };
    },
};
