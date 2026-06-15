export const sevenDaysToDie = {
    meta: {
        displayName: '7 Days to Die',
        icon: '🧟',
    },
    forge: {
        appId: '294420',
        relExe: '7DaysToDieServer.exe',
    },
    backend: {
        category: 'DIRECT_CONSOLE',
        playerListCommand: 'listplayers',
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
        { id: 'game',    label: 'Game Port',    default: 26900, tcp: true,  udp: true,  description: 'Player connections' },
        { id: 'telnet',  label: 'Telnet',       default: 8081,  tcp: true,  udp: false, description: 'Admin console (Telnet)' },
        { id: 'control', label: 'Control Panel', default: 8080, tcp: true,  udp: false, description: 'Web control panel' },
    ],
    quickActions: [
        { label: 'List Players', command: 'listplayers' },
        { label: 'Save',         command: 'saveworld' },
    ],
    parseForRsm(fileContentsMap, { installDir }) {
        const content = fileContentsMap['serverconfig.xml'] || '';
        function parseProp(name) {
            const m = content.match(new RegExp(`<property\\s+name="${name}"\\s+value="([^"]*)"`, 'i'));
            return m ? m[1] : null;
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
