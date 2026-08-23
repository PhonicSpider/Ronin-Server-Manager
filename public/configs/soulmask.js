// Soulmask uses only launch arguments -- no pre-existing config file.
export const soulmask = {
    meta: {
        displayName: 'Soulmask',
        icon: 'logos/soulmaskLogo.png',
    },
    forge: {
        appId: '2646460',
        relExe: 'WS\\Binaries\\Win64\\WSServer-Win64-Shipping.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        // List_OnlinePlayers (alias lp) -- confirmed via multiple hosting
        // guides. Soulmask's RCON was previously entirely unexposed in this
        // config despite being fully supported.
        playerListCommand: 'List_OnlinePlayers',
        // Not yet verified against a real log file -- add patterns here once
        // someone's actually run this server and seen what's noisy.
        logNoisePatterns: [],
    },
    label: 'SERVER EXECUTABLE (WSServer-Win64-Shipping.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'block',
        portPass: 'block',
    },
    defaults: {
        newName: 'e.g. Soulmask - Primal Lands',
        exePath: '...\\WS\\Binaries\\Win64\\WSServer-Win64-Shipping.exe',
        workingDir: 'C:\\Servers\\Soulmask',
        // -rconpsw/-rconaddr/-rconport enable RCON -- confirmed launch-flag
        // syntax (Soulmask uses flags, not a config-file section, for RCON).
        customArgs: '/Game/Aki/Maps/RW_Aki?listen -server -ServerName="Soulmask Server" -Port=7777 -QueryPort=27015 -MaxPlayers=40 -log -UTF8Output -rconpsw="changeme" -rconaddr=0.0.0.0 -rconport=19000',
        portId: 'RCON Port',
        portPass: 'RCON Password',
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
        { id: 'game',  label: 'Game Port',  default: 7777,  tcp: true,  udp: true,  description: 'Player connections' },
        { id: 'query', label: 'Query Port', default: 27015, tcp: false, udp: true,  description: 'Steam server browser' },
        { id: 'rcon',  label: 'RCON Port',  default: 19000, tcp: true,  udp: false, description: 'Admin console (RCON)' },
    ],
    quickActions: [
        { label: 'List Players', command: 'List_OnlinePlayers' },
    ],
};
