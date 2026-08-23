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
        portPass: 'API Key',
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
        { id: 'game',  label: 'Game Port', default: 27016, tcp: false, udp: true,  description: 'Player connections (UDP)' },
        { id: 'steam', label: 'Steam Port', default: 8766, tcp: false, udp: true,  description: 'Steam networking' },
        { id: 'api',   label: 'API Port',  default: 8080,  tcp: true,  udp: false, description: 'Remote API / admin access' },
    ],
    quickActions: [
        { label: 'Save World',    command: '\\save' },
        { label: 'Server Status', command: '\\status' },
        { label: 'List Players',  command: '\\players' },
    ],
    parseForRsm(fileContentsMap, { installDir, exePath }) {
        const content = fileContentsMap['SpaceEngineers-Dedicated.cfg'] || '';
        function parseTag(tag) {
            const m = content.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
            return m ? m[1].trim() : null;
        }
        const apiPort = parseTag('RemoteApiPort') || '8080';
        const apiPass = parseTag('RemoteApiKey')  || '';
        return {
            args: `-path "${installDir}" -console`,
            apiPort,
            apiPass,
            logPath: '',
        };
    },
};
