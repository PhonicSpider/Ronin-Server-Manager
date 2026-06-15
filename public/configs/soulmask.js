// Soulmask uses only launch arguments -- no pre-existing config file.
export const soulmask = {
    meta: {
        displayName: 'Soulmask',
        icon: '🎭',
    },
    forge: {
        appId: '2646460',
        relExe: 'WS\\Binaries\\Win64\\WSServer-Win64-Shipping.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        playerListCommand: null,
    },
    label: 'SERVER EXECUTABLE (WSServer-Win64-Shipping.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'none',
        portPass: 'none',
    },
    defaults: {
        newName: 'e.g. Soulmask - Primal Lands',
        exePath: '...\\WS\\Binaries\\Win64\\WSServer-Win64-Shipping.exe',
        workingDir: 'C:\\Servers\\Soulmask',
        customArgs: '/Game/Aki/Maps/RW_Aki?listen -server -ServerName="Soulmask Server" -Port=7777 -QueryPort=27015 -MaxPlayers=40 -log -UTF8Output',
    },
    varInputs: {
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        customArgs: 'value',
    },
    firewallPorts: [
        { id: 'game',  label: 'Game Port',  default: 7777,  tcp: true,  udp: true,  description: 'Player connections' },
        { id: 'query', label: 'Query Port', default: 27015, tcp: false, udp: true,  description: 'Steam server browser' },
    ],
    quickActions: [],
};
