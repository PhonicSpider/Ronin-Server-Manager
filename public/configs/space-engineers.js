export const spaceEngineers = {
    meta: {
        displayName: 'Space Engineers',
        icon: 'logos/seLogo.png',
    },
    forge: {
        appId: '298740',
        relExe: 'DedicatedServer64\\SpaceEngineersDedicated.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        playerListCommand: null,
        // Verified against real SpaceEngineersDedicated_*.log files (grep,
        // not guessed): every raw line is "TIMESTAMP - Thread: N -> MESSAGE",
        // so these match on the MESSAGE text, never on a '|' prefix (RSM adds
        // that itself for display, after this filter already ran).
        logNoisePatterns: [
            'elasticsearch',
            'collision shapes',
            'analytics',
            'memory legend',
            'memory values',
            'statistics legend',
            'statistics values',
            // 'loading cube blocks' intentionally not filtered -- kept visible.
            'created block definitions',
        ],
        // How RSM asks this game to save and quit before closing the process.
        // VRage Remote API: DELETE /v1/server stops the dedicated server (it saves first).
        gracefulStop: { transport: 'vrage-remote', commands: [], timeoutSeconds: 60 },
    },
    gameFiles: {
        configs: [
            { label: 'Dedicated Config', file: 'SpaceEngineers-Dedicated.cfg' },
        ],
    },
    label: 'SERVER EXECUTABLE (SpaceEngineersDedicated.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        log: 'block',
        port: 'block',
        portPass: 'block',
        args: 'block',
    },
    defaults: {
        newName: 'e.g. SE - Orion Sector',
        exePath: '...\\DedicatedServer64\\SpaceEngineersDedicated.exe',
        workingDir: 'C:\\ProgramData\\SpaceEngineersDedicated\\Instance',
        logPath: 'Select SpaceEngineersDedicated.log location...',
        portId: 'API Port',
        portPass: 'Remote Security Key',
        customArgs: '-console -ignorelastsession',
    },
    varInputs: {
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        logPath: 'placeholder',
        portId: 'placeholder',
        portPass: 'placeholder',
        customArgs: 'value',
    },
    firewallPorts: [
        { id: 'game', label: 'Game Port', default: 27016, tcp: false, udp: true, description: 'Player connections (UDP)' },
        { id: 'steam', label: 'Steam Port', default: 8766, tcp: false, udp: true, description: 'Steam networking' },
        { id: 'api', label: 'API Port', default: 8080, tcp: false, udp: false, description: 'VRage Remote API (HMAC-signed, plain HTTP) -- closed by default -- RSM reaches it over localhost' },
    ],
    // The Remote API has no console-command runner, so server-protocols.js gives the
    // console a small command language mapped onto the routes that do the same jobs
    // (save, status, players, grids, floating objects, delete/stop, power, chat,
    // kick/ban). Type "help" in the console for the full list. Destructive commands
    // (delete, clear) stay typed on purpose and are not one-click buttons.
    quickActions: [
        { label: 'Save World',       command: 'save' },
        { label: 'Server Status',    command: 'status' },
        { label: 'List Players',     command: 'players' },
        { label: 'List Grids',       command: 'grids' },
        { label: 'Floating Objects', command: 'floating' },
        { label: 'Commands',         command: 'help' },
    ],
    parseForRsm(fileContentsMap, { installDir, exePath }) {
        const content = fileContentsMap['SpaceEngineers-Dedicated.cfg'] || '';
        function parseTag(tag) {
            const match = content.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
            return match ? match[1].trim() : null;
        }
        const apiPort = parseTag('RemoteApiPort') || '8080';
        // The element is <RemoteSecurityKey> (not RemoteApiKey, which never existed).
        const apiPass = parseTag('RemoteSecurityKey') || '';
        return {
            args: `-path "${installDir}" -console`,
            apiPort,
            apiPass,
            logPath: '',
        };
    },
};
