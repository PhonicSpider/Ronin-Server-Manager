// Satisfactory uses a browser-based manager API; settings are configured in-game.
export const satisfactory = {
    meta: {
        displayName: 'Satisfactory',
        icon: '🏭',
    },
    forge: {
        appId: '1690800',
        relExe: 'Engine\\Binaries\\Win64\\UnrealServer-Win64-Shipping.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        playerListCommand: null,
    },
    label: 'SERVER EXECUTABLE (UnrealServer-Win64-Shipping.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'block',
        portPass: 'block',
    },
    defaults: {
        newName: 'e.g. Satisfactory - Factory Alpha',
        exePath: '...\\Engine\\Binaries\\Win64\\UnrealServer-Win64-Shipping.exe',
        workingDir: 'C:\\Servers\\Satisfactory',
        customArgs: 'FactoryGame -log -NoSteamClient -unattended -Port=7777',
        portId: 'Manager Port',
        portPass: 'Manager Password',
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
        { id: 'game',    label: 'Game Port',    default: 7777,  tcp: false, udp: true,  description: 'Player connections' },
        { id: 'beacon',  label: 'Beacon Port',  default: 15000, tcp: false, udp: true,  description: 'Server beacon' },
        { id: 'manager', label: 'Manager Port', default: 7778,  tcp: true,  udp: false, description: 'Web manager API' },
    ],
    quickActions: [],
};
