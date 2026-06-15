// Valheim has no config file -- all settings are launch arguments.
export const valheim = {
    meta: {
        displayName: 'Valheim',
        icon: '⚔',
    },
    forge: {
        appId: '896660',
        relExe: 'valheim_server.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        playerListCommand: null,
    },
    label: 'SERVER EXECUTABLE (valheim_server.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'none',
        portPass: 'none',
    },
    defaults: {
        newName: 'e.g. Valheim - Midgard',
        exePath: '...\\valheim_server.exe',
        workingDir: 'C:\\Servers\\Valheim',
        customArgs: '-nographics -batchmode -name "My Valheim Server" -port 2456 -world "Dedicated" -password "changeme" -public 1',
    },
    varInputs: {
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        customArgs: 'value',
    },
    firewallPorts: [
        { id: 'game',  label: 'Game Port',     default: 2456, tcp: false, udp: true, description: 'Player connections' },
        { id: 'gamea', label: 'Game Port + 1', default: 2457, tcp: false, udp: true, description: 'Required by Valheim' },
        { id: 'gameb', label: 'Game Port + 2', default: 2458, tcp: false, udp: true, description: 'Required by Valheim' },
    ],
    quickActions: [],
};
