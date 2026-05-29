export const gameName = {
    // --- Fields for adding game as an option to select when adding servers. ---
    meta: {
        displayName: "Game Name",
        icon: "logos/gameLogo.png" // or a regular emoji will work as well (e.g. "🎮")
    },
    backend: {
        // DIRECT_CONSOLE --process is spawned directly; PID is captured immediately, no deep search needed.
        //                   Use for Java/script-based servers (Minecraft, etc.).
        // POWERSHELL_BRIDGE--process is launched hidden via PowerShell; PID is found via deep search.
        //                   Use for native .exe servers (SE, Ark, Terraria, etc.).
        //                   Multi-instance note: the deep search first tries parent-child (reliable for most
        //                   games). If the game self-relaunches and breaks that link (like Space Engineers),
        //                   it falls back to matching the workingDir path inside the process CommandLine.
        //                   For self-relaunching games, make sure workingDir also appears in customArgs
        //                   (e.g. SE uses -path "<workingDir>") so each instance can be told apart.
        category: "DIRECT_CONSOLE",
        // playerListCommand--console command RSM sends to retrieve the player list for the REST API.
        //                     Set to null if the game uses a custom HTTP API instead of the command pipeline
        //                     (e.g. Space Engineers). Omit entirely if player listing is not supported.
        //                     RSM auto-parses Minecraft-style and RCON numbered-list responses.
        playerListCommand: "list"
    },
    
    // --- Optional: Config files accessible via the in-app config editor. ---
    // Omit this block entirely if the game has no editable config files.
    gameFiles: {
        // Optional subfolder relative to workingDir where the configs live.
        // If omitted, files are looked up directly in workingDir.
        configPath: "relative/subfolder",

        // Each entry becomes a tab in the config editor.
        // 'label' is the tab name shown in the UI; 'file' is the filename inside configPath (or workingDir).
        configs: [
            { label: "Server Config", file: "config.ini" },
            // { label: "Second File",  file: "other.cfg" },
        ]
    },

    // --- Fields for configuring how the server setup modal should look and function for this game. ---
    label: "DISPLAY LABEL (e.g. GAME_SERVER.EXE)", // The label above the input for the executable path. Make it descriptive to help users know what to put there.
    blocks: {
        path: 'block',        // exePath container
        workingDir: 'block',  // workingDir container
        args: 'block',        // customArgs container
        log: 'none',          // logPath container
        port: 'none',         // portId container
        portPass: 'none'      // portPass container
    },
    defaults: {
        // Optional placeholders if blocks are enabled, can set any block placeholder or value here
        newName: "Server Display Name",
        exePath: "C:\\Path\\To\\Executable",
        workingDir: "C:\\Path\\To\\Folder",
        customArgs: "-launch -flags",
        logPath: "Path to log file...",
        portId: "8080"
    },
    varInputs: { // Determine whether defaults will be placeholders or values
        // or can use "value" if you want the default to be pre-filled instead of a placeholder
        exePath: "placeholder",
        workingDir: "placeholder",
        logPath: "placeholder",
        portId: "placeholder",
        portPass: "placeholder",
        customArgs: "value",
    },

    // --- Optional: Firewall port definitions for the Portier integration. ---
    // Each entry creates an editable row in the server panel's Firewall Ports card.
    // Per-server overrides are saved in the server's JSON and merged over these defaults at runtime.
    // Omit this block entirely if the game has no firewall ports to manage.
    firewallPorts: [
        { id: 'game',  label: 'Game Port', default: 25565, tcp: true,  udp: true,  description: 'Player connections' },
        // { id: 'rcon',  label: 'RCON',      default: 25575, tcp: true,  udp: false, description: 'Admin console' },
        // { id: 'query', label: 'Query Port', default: 27015, tcp: false, udp: true,  description: 'Server browser' },
        // { id: 'api',   label: 'API Port',   default: 8080,  tcp: true,  udp: false, description: 'HTTP API' },
    ]
};

// --- BE SURE TO  ADD THE GAME TO THE INDEX.JS FILE AFTER CREATING THIS TEMPLATE! ---


// =================================================================================================\\
//                 CONFIGURATION MODAL REFERENCE MAP   (ADD NEW SERVERS HERE)                       \\
// =================================================================================================\\
// CONTAINER ID         | DISPLAY OPTIONS  | PLACEHOLDER/VALUE ID | DESCRIPTION                     \\
// ---------------------|------------------|----------------------|---------------------------------\\
// label                | block (Static)   | newName              | The UI list display name        \\
// path                 | block / none     | exePath              | The main file/app to run        \\
// workingDir           | block / none     | workingDir           | Folder context for the app      \\
// log                  | block / none     | logPath              | External file to read logs      \\
// port                 | block / none     | portId               | Network port for API/RCON       \\
// portPass             | block / none     | portPass             | Password for API access         \\
// args                 | block / none     | customArgs           | Startup flags and switches      \\
// =================================================================================================\\
