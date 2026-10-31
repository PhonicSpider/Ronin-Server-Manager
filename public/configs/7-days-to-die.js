export const sevenDaysToDie = {
    meta: {
        displayName: '7 Days to Die',
        icon: 'logos/sevenDaysLogo.png',
    },
    forge: {
        appId: '294420',
        relExe: '7DaysToDieServer.exe',
    },
    backend: {
        category: 'DIRECT_CONSOLE',
        playerListCommand: 'listplayers',
        // Not verified against a real log yet -- 7 Days to Die is
        // DIRECT_CONSOLE (stdin/stdout piped directly), so this isn't
        // consumed today, but keep it for consistency / a future switch.
        logNoisePatterns: [],
        // How RSM asks this game to save and quit before closing the process.
        // "shutdown" is the clean stop command.
        gracefulStop: { transport: 'stdin', commands: ['saveworld', 'shutdown'], timeoutSeconds: 60 },
    },
    gameFiles: {
        configs: [
            { label: 'serverconfig.xml', file: 'serverconfig.xml' },
        ],
    },
    label: 'SERVER EXECUTABLE (7DaysToDieServer.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'block',
        portPass: 'block',
    },
    defaults: {
        newName: 'e.g. 7 Days - Wasteland',
        exePath: '...\\7DaysToDieServer.exe',
        workingDir: 'C:\\Servers\\7DaysToDie',
        customArgs: '-configfile="serverconfig.xml" -logfile "output_log.txt" -quit -batchmode -nographics -dedicated',
        portId: 'Telnet Port',
        portPass: 'Telnet Password',
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
        { id: 'game', label: 'Game Port', default: 26900, tcp: true, udp: true, description: 'Player connections' },
        { id: 'steam1', label: 'Game Port +1', default: 26901, tcp: false, udp: true, description: 'Steam networking (UDP)' },
        { id: 'steam2', label: 'Game Port +2', default: 26902, tcp: false, udp: true, description: 'Steam networking (UDP)' },
        { id: 'crossplay', label: 'Game Port +3', default: 26903, tcp: false, udp: true, description: 'Crossplay (UDP)' },
        { id: 'telnet', label: 'Telnet', default: 8081, tcp: false, udp: false, description: 'Admin console (Telnet) -- closed by default -- RSM reaches it over localhost' },
        { id: 'control', label: 'Control Panel', default: 8080, tcp: false, udp: false, description: 'Web control panel -- closed by default -- RSM reaches it over localhost' },
    ],
    quickActions: [
        { label: 'List Players', command: 'listplayers' },
        { label: 'Save',         command: 'saveworld' },
    ],
    parseForRsm(fileContentsMap, { installDir }) {
        const content = fileContentsMap['serverconfig.xml'] || '';
        function parseProp(name) {
            const match = content.match(new RegExp(`<property\\s+name="${name}"\\s+value="([^"]*)"`, 'i'));
            return match ? match[1] : null;
        }
        const apiPort = parseProp('TelnetPort')     || '8081';
        const apiPass = parseProp('TelnetPassword') || '';
        return {
            args: `-configfile="${installDir}\\serverconfig.xml" -logfile "${installDir}\\output_log.txt" -quit -batchmode -nographics -dedicated`,
            apiPort,
            apiPass,
            logPath: installDir + '\\output_log.txt',
        };
    },
};
