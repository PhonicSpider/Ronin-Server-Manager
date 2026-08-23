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
        customArgs: '/Game/AbioticFactor/Maps/AF_PersistentWorld?listen -Port=7777 -MaxPlayers=6 -AdminPassword=changeme -log',
    },
    varInputs: {
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        customArgs: 'value',
    },
    firewallPorts: [
        { id: 'game', label: 'Game Port', default: 7777, tcp: true, udp: true, description: 'Player connections (max 6)' },
    ],
    quickActions: [],
};
