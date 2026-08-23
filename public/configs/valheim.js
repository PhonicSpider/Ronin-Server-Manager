// Valheim has no config file -- all settings are launch arguments.
export const valheim = {
    meta: {
        displayName: 'Valheim',
        icon: 'logos/valheimLogo.png',
    },
    forge: {
        appId: '896660',
        relExe: 'valheim_server.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        // Valheim has no native RCON at all -- only a third-party BepInEx mod
        // (ValheimRcon) adds one. Vanilla player listing is only visible
        // in-game (F2 overlay), which RSM has no access to.
        playerListCommand: null,
        // Not yet verified against a real log file -- add patterns here once
        // someone's actually run this server and seen what's noisy.
        logNoisePatterns: [],
    },
    label: 'SERVER EXECUTABLE (valheim_server.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        // Valheim writes nothing to disk by default -- -logFile is required
        // (capital F, unlike most other games' -logfile).
        log: 'block',
        port: 'none',
        portPass: 'none',
    },
    defaults: {
        newName: 'e.g. Valheim - Midgard',
        exePath: '...\\valheim_server.exe',
        workingDir: 'C:\\Servers\\Valheim',
        customArgs: '-nographics -batchmode -name "My Valheim Server" -port 2456 -world "Dedicated" -password "changeme" -public 1 -logFile "logs\\valheim_server.log"',
        logPath: 'C:\\Path\\To\\Valheim\\logs\\valheim_server.log',
    },
    varInputs: {
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        customArgs: 'value',
        logPath: 'placeholder',
    },
    firewallPorts: [
        { id: 'game',  label: 'Game Port',     default: 2456, tcp: false, udp: true, description: 'Player connections' },
        { id: 'gamea', label: 'Game Port + 1', default: 2457, tcp: false, udp: true, description: 'Required by Valheim' },
        { id: 'gameb', label: 'Game Port + 2', default: 2458, tcp: false, udp: true, description: 'Required by Valheim' },
    ],
    quickActions: [],
};
