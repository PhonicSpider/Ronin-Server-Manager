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
        // Not yet verified against a real log file -- add patterns here once
        // someone's actually run this server and seen what's noisy.
        logNoisePatterns: [],
        // No verified graceful-stop route for this game yet, so RSM closes the
        // process directly. See ServerTemplate.js for the supported transports.
        gracefulStop: null,
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
        { id: 'game', label: 'Game Port', default: 7777, tcp: false, udp: true, description: 'Player connections and lightweight query (UDP)' },
        { id: 'api', label: 'API Port', default: 7777, tcp: true, udp: false, description: 'Server traffic and HTTPS API (TCP) -- same port number as the Game Port' },
        { id: 'reliable', label: 'Reliable Messaging', default: 8888, tcp: true, udp: false, description: 'Required since Satisfactory 1.0 (replaces the old 15000 beacon port)' },
    ],
    quickActions: [],
};
