export const gameName = {

    // ── DISPLAY ─────────────────────────────────────────────────────────────────
    meta: {
        displayName: 'Game Name',
        icon: 'logos/gameLogo.png', // relative path OR an emoji e.g. '🎮'
    },

    // ── INSTALL (OPTIONAL) ──────────────────────────────────────────────────────
    // Include this block if the game can be auto-installed via SteamCMD.
    // Omit it entirely for games that must be installed manually.
    forge: {
        appId: '123456',                      // Steam App ID (string). null = not on Steam.
        relExe: 'server.exe',                 // Executable path relative to the install folder.
        // requiresExternalExe: true,         // Set true for Java/script-based servers where
        //                                    // the launcher exe is NOT inside the install folder.
        // exeLabel: 'Java Executable (java.exe)', // Label shown on the browse button for the exe.
    },

    // ── BACKEND ─────────────────────────────────────────────────────────────────
    backend: {
        // DIRECT_CONSOLE   -- process is spawned directly; PID is captured immediately.
        //                     Use for Java/script-based servers (Minecraft, Project Zomboid, etc.)
        // POWERSHELL_BRIDGE -- process launched hidden via PowerShell; PID found via deep search.
        //                     Use for native .exe servers (Rust, ARK, Valheim, etc.)
        category: 'DIRECT_CONSOLE',

        // Console command RSM sends to list players for the REST API.
        // Set null if the game has no player-list command.
        playerListCommand: 'list',

        // Lines to drop from this game's log-file console readout (POWERSHELL_BRIDGE
        // only -- DIRECT_CONSOLE games stream stdin/stdout directly, no file to filter).
        // Every dedicated-server engine has its own noisy boilerplate (asset-loading
        // spam, periodic stat dumps, telemetry, etc.) that clutters the Live Console
        // for no benefit. Each string is a lowercase substring checked against every
        // log line (line.toLowerCase().includes(pattern)) -- match on the line's real
        // content, not on the '| ' prefix RSM adds for display (that gets added AFTER
        // this filter runs, so it will never appear in the raw line here). Leave this
        // an empty array until you've actually run the game and seen what's noisy --
        // don't guess at patterns, verify them against a real log file first.
        logNoisePatterns: [],
    },

    // ── CONFIG FILES (OPTIONAL) ─────────────────────────────────────────────────
    // Lists the config files RSM will open in the editor after install or when editing.
    // Omit this block if the game has no editable config files (args-only games).
    gameFiles: {
        // Subfolder relative to the server install/working directory.
        // Omit configPath if the files live directly in the root folder.
        configPath: 'optional\\subfolder',

        // Each entry becomes a tab in the config editor.
        configs: [
            { label: 'Server Config', file: 'config.ini' },
            // { label: 'Second File', file: 'other.cfg' },
        ],
    },

    // ── SETUP MODAL (EDIT FLOW) ─────────────────────────────────────────────────
    // Controls which fields show in the "Edit Server" form.
    label: 'SERVER EXECUTABLE (server.exe)',
    blocks: {
        path: 'block',       // 'block' = visible, 'none' = hidden
        workingDir: 'block',
        args: 'block',
        log: 'none',
        port: 'none',
        portPass: 'none',
    },
    defaults: {
        newName: 'Server Display Name',
        exePath: 'C:\\Path\\To\\Executable',
        workingDir: 'C:\\Path\\To\\ServerFolder',
        customArgs: '-launch -flags',
        // logPath: 'Path to log file...',
        // portId: '8080',
        // portPass: 'password',
    },
    varInputs: {
        // 'placeholder' = shown as greyed placeholder text
        // 'value'       = pre-filled as an editable value
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        customArgs: 'value',
    },

    // ── FIREWALL PORTS ──────────────────────────────────────────────────────────
    firewallPorts: [
        { id: 'game', label: 'Game Port', default: 27015, tcp: true, udp: true, description: 'Player connections' },
        // { id: 'rcon',  label: 'RCON',      default: 25575, tcp: true,  udp: false, description: 'Admin console' },
        // { id: 'query', label: 'Query Port', default: 27015, tcp: false, udp: true,  description: 'Server browser' },
    ],

    // ── QUICK ACTIONS ───────────────────────────────────────────────────────────
    quickActions: [
        // { label: 'List Players', command: 'list' },
    ],

    // ── CONFIG PARSER (OPTIONAL) ────────────────────────────────────────────────
    // Called after install or when adding an existing server.
    // fileContentsMap: object keyed by filename (from gameFiles.configs[].file)
    // { installDir, exePath }: pre-resolved paths from main process
    // Returns partial RSM entry fields: args, apiPort, apiPass, logPath
    // Omit this function if the game has no config files to parse.
    parseForRsm(fileContentsMap, { installDir, exePath }) {
        const content = fileContentsMap['config.ini'] || '';
        // ... parse content ...
        return {
            args:    '-launch -flags',
            apiPort: '27015',
            apiPass: '',
            logPath: '',
        };
    },

};

// ── ADD TO INDEX ──────────────────────────────────────────────────────────────
// After creating this file, import it in index.js and add it to ServerTypeRegistry.

// =============================================================================
//   BLOCKS REFERENCE
// =============================================================================
// ID          | Values           | Field shown
// ------------|------------------|--------------------------------------------
// path        | 'block' / 'none' | Executable path (+ browse button)
// workingDir  | 'block' / 'none' | Server folder (+ browse button)
// args        | 'block' / 'none' | Launch arguments textarea
// log         | 'block' / 'none' | Log file/folder path (+ browse button)
// port        | 'block' / 'none' | API / RCON port number
// portPass    | 'block' / 'none' | API / RCON password
// =============================================================================
