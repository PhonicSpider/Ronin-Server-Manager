export const gameName = {
    // --- Fields for adding game as an option to select when adding servers. ---
    meta: {
        displayName: "Game Name",
        icon: "logos/gameLogo.png" // or a regular emoji will work as well (e.g. "🎮")
    }
    backend: {
        category: "DIRECT_CONSOLE" // or "POWERSHELL_BRIDGE" Mainly for determining how to send commands to the server process.
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
        // Optional placeholders if blocks are enabled:
        newName: "Server Display Name",
        exePath: "C:\\Path\\To\\Executable",
        workingDir: "C:\\Path\\To\\Folder",
        customArgs: "-launch -flags",
        logPath: "Path to log file...",
        portId: "8080"
    },
    varInputs: { // Determine whether defaults will be placeholders or values
        newName: "placeholder", // or can use "value" if you want the default to be pre-filled instead of a placeholder
        exePath: "placeholder",
        workingDir: "placeholder",
        logPath: "placeholder",
        portId: "placeholder",
        portPass: "placeholder",
        customArgs: "placeholder",
    }
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
