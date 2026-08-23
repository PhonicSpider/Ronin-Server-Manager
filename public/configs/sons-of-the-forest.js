// Sons of the Forest uses only launch arguments -- no config file in the install folder.
export const sonsOfTheForest = {
    meta: {
        displayName: 'Sons of the Forest',
        icon: 'logos/sotfLogo.png',
    },
    forge: {
        appId: '2465200',
        relExe: 'SonsOfTheForestDS.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        playerListCommand: null,
        // Not yet verified against a real log file -- add patterns here once
        // someone's actually run this server and seen what's noisy.
        logNoisePatterns: [],
    },
    label: 'SERVER EXECUTABLE (SonsOfTheForestDS.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'none',
        portPass: 'none',
    },
    defaults: {
        newName: 'e.g. Sons of the Forest - The Island',
        exePath: '...\\SonsOfTheForestDS.exe',
        workingDir: 'C:\\Servers\\SonsOfTheForest',
        customArgs: '-serverip 0.0.0.0 -port 8766 -queryport 27016 -blobsyncport 9700 -maxplayers 8 -name "My Server" -saveslot 1 -enablegameanalytics false',
    },
    varInputs: {
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        customArgs: 'value',
    },
    firewallPorts: [
        { id: 'game',  label: 'Game Port',  default: 8766,  tcp: true,  udp: true,  description: 'Player connections' },
        { id: 'query', label: 'Query Port', default: 27016, tcp: false, udp: true,  description: 'Steam server browser' },
        { id: 'blob',  label: 'Blob Sync',  default: 9700,  tcp: true,  udp: false, description: 'Save sync' },
    ],
    quickActions: [],
};
