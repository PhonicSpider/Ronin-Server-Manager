export const rust = {
    meta: {
        displayName: 'Rust',
        icon: '🔩',
    },
    forge: {
        appId: '258550',
        relExe: 'RustDedicated.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        playerListCommand: null,
    },
    gameFiles: {
        configPath: 'server\\server1\\cfg',
        configs: [
            { label: 'server.cfg', file: 'server.cfg' },
        ],
    },
    label: 'SERVER EXECUTABLE (RustDedicated.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'block',
        portPass: 'block',
    },
    defaults: {
        newName: 'e.g. Rust - Survival Island',
        exePath: '...\\RustDedicated.exe',
        workingDir: 'C:\\Servers\\Rust',
        customArgs: '-batchmode -nographics +server.identity "server1" +server.port 28015 +rcon.port 28016 +rcon.password "changeme" +rcon.web 1',
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
        { id: 'game',  label: 'Game Port',  default: 28015, tcp: false, udp: true,  description: 'Player connections' },
        { id: 'query', label: 'Query Port', default: 28017, tcp: false, udp: true,  description: 'Steam server browser' },
        { id: 'rcon',  label: 'WebRCON',    default: 28016, tcp: true,  udp: false, description: 'Admin console (WebRCON)' },
    ],
    quickActions: [
        { label: 'List Players', command: 'global.players' },
        { label: 'Save',         command: 'server.save' },
    ],
    parseForRsm(fileContentsMap, { installDir, exePath }) {
        const content = fileContentsMap['server.cfg'] || '';
        function parseVal(key) {
            const m = content.match(new RegExp(`^\\s*${key}\\s+(?:"([^"\\n]*)"|([^\\s\\n]+))`, 'm'));
            if (!m) return null;
            return (m[1] !== undefined ? m[1] : m[2] || '').trim();
        }
        const apiPort  = parseVal('rcon\\.port')     || '28016';
        const apiPass  = parseVal('rcon\\.password') || '';
        const gamePort = parseVal('server\\.port')   || '28015';
        const identity = 'server1';
        const logFile  = installDir + '\\rust-console.log';
        const args = [
            '-batchmode', '-nographics',
            `+server.identity "${identity}"`,
            `+server.port ${gamePort}`,
            `+rcon.port ${apiPort}`,
            `+rcon.password "${apiPass.replace(/"/g, '')}"`,
            '+rcon.web 1',
            `-logfile "${logFile}"`,
        ].join(' ');
        return { args, apiPort, apiPass, logPath: logFile };
    },
};
