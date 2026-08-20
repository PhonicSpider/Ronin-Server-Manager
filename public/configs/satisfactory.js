// Satisfactory uses a browser-based manager API; settings are configured in-game.
export const satisfactory = {
    meta: {
        displayName: 'Satisfactory',
        icon: 'logos/satisfactoryLogo.png',
    },
    forge: {
        appId: '1690800',
        relExe: 'Engine\\Binaries\\Win64\\UnrealServer-Win64-Shipping.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        // Player count uses Satisfactory's HTTPS API directly (see the
        // dedicated 'satisfactory' branch in get-player-count in main.js) --
        // a two-step login-then-query flow against a self-signed cert, not
        // RCON, so this stays null rather than driving the generic RCON
        // dispatch this field would otherwise trigger.
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
        // The HTTPS API runs on the SAME port as the game (7777 by default),
        // not a separate manager port -- confirmed against the official
        // Satisfactory wiki. A prior version of this config incorrectly used
        // a distinct 7778 "Manager Port".
        portId: 'API Port (same as Game Port)',
        portPass: 'Admin/Client Password',
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
        { id: 'game',   label: 'Game Port',   default: 7777,  tcp: false, udp: true,  description: 'Player connections (UDP) -- the HTTPS API also uses this same port over TCP' },
        { id: 'api',    label: 'API Port',    default: 7777,  tcp: true,  udp: false,  description: 'HTTPS API (self-signed TLS) -- same port number as Game Port' },
        { id: 'beacon', label: 'Beacon Port', default: 15000, tcp: false, udp: true,  description: 'Server beacon' },
    ],
    quickActions: [],
};
