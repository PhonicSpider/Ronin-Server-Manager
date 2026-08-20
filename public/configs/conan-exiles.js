export const conanExiles = {
    meta: {
        displayName: 'Conan Exiles',
        icon: 'logos/conanLogo.png',
    },
    forge: {
        appId: '443030',
        relExe: 'ConanSandbox\\Binaries\\Win64\\ConanSandboxServer-Win64-Shipping.exe',
    },
    backend: {
        category: 'POWERSHELL_BRIDGE',
        // Conan Exiles' RCON plugin uses lowercase command names, unlike ARK's
        // PascalCase (ListPlayers) despite the similar engine lineage. Verified
        // against the official wiki and multiple hosting-provider docs.
        playerListCommand: 'listplayers',
    },
    gameFiles: {
        configPath: 'ConanSandbox\\Saved\\Config\\WindowsServer',
        configs: [
            { label: 'Engine.ini',           file: 'Engine.ini' },
            { label: 'Game.ini',             file: 'Game.ini' },
            { label: 'ServerSettings.ini',   file: 'ServerSettings.ini' },
        ],
    },
    label: 'SERVER EXECUTABLE (ConanSandboxServer-Win64-Shipping.exe)',
    blocks: {
        path: 'block',
        workingDir: 'block',
        args: 'block',
        log: 'block',
        port: 'block',
        portPass: 'block',
    },
    defaults: {
        newName: 'e.g. Conan Exiles - The Exiled Lands',
        exePath: '...\\ConanSandbox\\Binaries\\Win64\\ConanSandboxServer-Win64-Shipping.exe',
        workingDir: 'C:\\Servers\\ConanExiles',
        customArgs: '/Game/Maps/ConanSandbox/ConanSandbox -log -Port=7777',
        // -log (already in customArgs above) writes here -- required for RSM's
        // PowerShell-bridge log tailing to show any console output at all.
        logPath: 'C:\\Path\\To\\ConanSandbox\\Saved\\Logs',
        portId: 'RCON Port',
        portPass: 'RCON Password',
    },
    varInputs: {
        newName: 'placeholder',
        exePath: 'placeholder',
        workingDir: 'placeholder',
        customArgs: 'value',
        logPath: 'placeholder',
        portId: 'placeholder',
        portPass: 'placeholder',
    },
    firewallPorts: [
        { id: 'game', label: 'Game Port', default: 7777,  tcp: true,  udp: true,  description: 'Player connections' },
        { id: 'peer', label: 'Peer Port', default: 7778,  tcp: true,  udp: true,  description: 'Peer-to-peer' },
        { id: 'rcon', label: 'RCON',      default: 25575, tcp: true,  udp: false, description: 'Admin console (RCON)' },
    ],
    quickActions: [
        { label: 'List Players', command: 'listplayers' },
        // 'SaveWorld' (ARK's save command) could not be confirmed as a real
        // Conan Exiles RCON command against official/community docs -- may be
        // an ARK-ism carried over by mistake. Left in place but unverified;
        // worth testing against a real server (or the RCON 'help' command)
        // before trusting it.
        { label: 'Save World',   command: 'SaveWorld' },
    ],
    parseForRsm(fileContentsMap, { installDir }) {
        const engineContent = fileContentsMap['Engine.ini'] || '';
        const gameContent   = fileContentsMap['Game.ini']   || '';
        function parseIni(content, section, key) {
            const secM = content.match(new RegExp(`\\[${section.replace(/\//g, '\\/')}\\]([\\s\\S]*?)(?=\\[|$)`, 'i'));
            if (!secM) return null;
            const m = secM[1].match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'mi'));
            return m ? m[1].trim() : null;
        }
        // RCON lives in Game.ini under [RconPlugin] -- NOT Engine.ini. Verified
        // against the official Conan Exiles wiki and hosting-provider docs.
        const apiPort  = parseIni(gameContent, 'RconPlugin', 'RconPort')     || '25575';
        const apiPass  = parseIni(gameContent, 'RconPlugin', 'RconPassword') || '';
        const gamePort = parseIni(engineContent, 'URL', 'Port')             || '7777';
        return {
            args: `/Game/Maps/ConanSandbox/ConanSandbox -log -Port=${gamePort}`,
            apiPort,
            apiPass,
            // -log writes here. Auto-filled since the path is fixed relative to
            // the install dir -- the folder itself won't exist until the server
            // has run once (see the Pre-Configuration note in the docs).
            logPath: installDir ? `${installDir}\\ConanSandbox\\Saved\\Logs` : '',
        };
    },
};
