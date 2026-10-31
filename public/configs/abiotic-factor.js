// Abiotic Factor uses only launch arguments -- no pre-existing config file.
export const abioticFactor = {
    meta: {
        displayName: 'Abiotic Factor',
        icon: 'logos/abioticLogo.png',
    },
    forge: {
        appId: '2857200',
        relExe: 'AbioticFactor\\Binaries\\Win64\\AbioticFactorServer-Win64-Shipping.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        playerListCommand: null,
        // Not yet verified against a real log file -- add patterns here once
        // someone's actually run this server and seen what's noisy.
        logNoisePatterns: [],
        // No verified graceful-stop route for this game yet, so RSM closes the
        // process directly. See ServerTemplate.js for the supported transports.
        gracefulStop: null,
    },
    label: 'SERVER EXECUTABLE (AbioticFactorServer-Win64-Shipping.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'none',
        portPass: 'none',
    },
    defaults: {
        newName: 'e.g. Abiotic Factor - Lab Delta',
        exePath: '...\\AbioticFactor\\Binaries\\Win64\\AbioticFactorServer-Win64-Shipping.exe',
        workingDir: 'C:\\Servers\\AbioticFactor',
        customArgs: '-log -useperfthreads -MaxServerPlayers=6 -PORT=7777 -QueryPort=27015 -SteamServerName="My Abiotic Server" -WorldSaveName=Cascade -AdminPassword=changeme',
    },
    varInputs: {
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        customArgs: 'value',
    },
    firewallPorts: [
        { id: 'game', label: 'Game Port', default: 7777, tcp: false, udp: true, description: 'Player connections (max 6 recommended)' },
        { id: 'query', label: 'Query Port', default: 27015, tcp: false, udp: true, description: 'Steam server browser' },
    ],
    quickActions: [],
};
