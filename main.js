const { app, BrowserWindow, shell, ipcMain, dialog, Tray, Menu, safeStorage } = require('electron');

// Prevent transient network errors (ECONNRESET, EPIPE) from crashing the main process.
// These are expected when a game server closes its RCON socket mid-read (e.g. on shutdown).
process.on('uncaughtException', (err) => {
    if (['ECONNRESET', 'EPIPE', 'ECONNREFUSED'].includes(err.code)) {
        console.warn(`[RSM] Suppressed transient network error: ${err.code}`);
        return;
    }
    console.error('[RSM] Uncaught exception:', err);
    dialog.showErrorBox('A JavaScript error occurred in the main process', `${err.message}\n${err.stack}`);
});
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { parseProcessId, escapePowerShellLiteral, runPowerShellScript } = require('./powershell-safety');
const si = require('systeminformation');
const os = require('os');
const { autoUpdater } = require('electron-updater');
const apiServer  = require('./api-server');
const roninAgent = require('./ronin-agent');
const firewallService = require('./firewall-service');
const { createConfigFileGuard } = require('./config-file-guard');
const serverProtocols = require('./server-protocols');
const { createSecretStore } = require('./secret-store');

// Encrypts the REST API key and Citadel agent token on disk (Windows DPAPI).
const secretStore = createSecretStore(safeStorage);
const { listProcessesByImageName, listChildProcesses, listRunningServices, createProcessSampler } = require('./windows-processes');

// Never download/install without an explicit user action -- checking is safe
// to do silently on startup, but replacing the running exe is not.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

// electron-updater silently no-ops checkForUpdates() -- fires zero events,
// no error -- when running unpackaged (electron . from source) unless told
// to use the real feed anyway. Safe here since autoDownload stays off either
// way; this only affects whether the *check* itself actually runs in dev.
if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true;
}

// Wire up api-server dependencies at module load time so they are always set
// before any HTTP request or IPC handler can reach the server.
// The closures capture module-level variables by reference -- always current.
// Helper functions referenced below (_apiAddServer, etc.) are function
// declarations defined near the bottom of this file and are hoisted.
apiServer.init({
    getManagedServers:  () => managedServers,
    getActiveProcesses: () => activeProcesses,
    getServerStats:     () => serverStats,
    getMainWindow:      () => mainWindow,
    findServType,
    ipcMain,
    logConsoleOut: (id, msg) => {
        const win = mainWindow;
        if (win && !win.isDestroyed()) win.webContents.send('console-out', { id, msg });
        const idx = managedServers.findIndex(managedServer => managedServer.id === id);
        if (idx === -1) return;
        const combined = (managedServers[idx].logs || '') + msg;
        const lines = combined.split('\n');
        managedServers[idx].logs = lines.slice(-MAX_LOG_LINES).join('\n');
    },
    // Server CRUD
    addServer:          _apiAddServer,
    updateServer:       _apiUpdateServer,
    deleteServer:       _apiDeleteServer,
    // Firewall
    getFirewallRules:   _apiGetFirewallRules,
    addFirewallRule:    _apiAddFirewallRule,
    removeFirewallRule: _apiRemoveFirewallRule,
    toggleFirewallRule: _apiToggleFirewallRule,
    // Config / backups
    readConfigFile:     _apiReadConfigFile,
    writeConfigFile:    _apiWriteConfigFile,
    listBackups:        _apiListBackups,
    // Forge proxy + app info
    getForgeConfig:     _apiGetForgeConfig,
    getAppVersion:      () => app.getVersion(),
    restartApp:         () => { app.relaunch(); app.exit(0); },
    // Same network protocol code the desktop UI uses (RCON, WebRCON, REST, VRage).
    queryPlayerCount:   serverProtocols.queryPlayerCount,
    sendNetworkCommand: serverProtocols.sendNetworkCommand,
});

roninAgent.init({
    getManagedServers:  () => managedServers,
    getActiveProcesses: () => activeProcesses,
    getServerStats:     () => serverStats,
    getMainWindow:      () => mainWindow,
    findServType,
    ipcMain,
    logConsoleOut: (id, msg) => {
        const win = mainWindow;
        if (win && !win.isDestroyed()) win.webContents.send('console-out', { id, msg });
    },
    // Firewall helpers (shared with api-server.js) for the portal firewall relay.
    getFirewallRules:   _apiGetFirewallRules,
    addFirewallRule:    _apiAddFirewallRule,
    removeFirewallRule: _apiRemoveFirewallRule,
    toggleFirewallRule: _apiToggleFirewallRule,
    getAppVersion: () => app.getVersion(),
    app,
});

let mainWindow;
let tray = null;
const activeProcesses  = {};
const serverStats      = {}; // { [srvId]: { cpu, ramMB } } -- updated each heartbeat tick
const pendingRestarts  = {}; // { [srvId]: srv } -- set by restart-server, consumed by stopServerCleanup
const DATA_FILE       = path.join(app.getPath('userData'), 'servers.json');
const API_CONFIG_FILE = path.join(app.getPath('userData'), 'api-config.json');
const TLS_CERT_FILE   = path.join(app.getPath('userData'), 'rsm-tls-cert.pem');
const TLS_KEY_FILE    = path.join(app.getPath('userData'), 'rsm-tls-key.pem');
const debugPrefix = "[RSM-DEBUG]";
const DebugActive = true;    // Set to true to enable verbose logging for debugging purposes
const DebugLogging = false;  // Set to true to enable debug logging for all operations
const DebugCPURAM = false;   // Set to true to enable detailed CPU/RAM logging in the perf loop

let managedServers = loadServers(); // hoisted from DATA section below

// Decides which files the config editor / REST API / Citadel relay may touch.
// Trusted folders: managed servers' directories, RSM's own Desktop\RSM-Files
// workspace, and folders the user picked through the folder dialog.
const configFileGuard = createConfigFileGuard({
    listManagedServers: () => managedServers,
    persistencePath: path.join(app.getPath('userData'), 'trusted-directories.json'),
    defaultTrustedDirectories: [path.join(app.getPath('desktop'), 'RSM-Files')],
});

//      _    ____  ____    ___ _   _ ___ _____
//     / \  |  _ \|  _ \  |_ _| \ | |_ _|_   _|
//    / _ \ | |_) | |_) |  | ||  \| || |  | |
//   / ___ \|  __/|  __/   | || |\  || |  | |
//  /_/   \_\_|   |_|     |___|_| \_|___| |_|
//

// --- WINDOW CREATION & CONFIGURATION ---
function createWindow() {
    if (mainWindow) return;
    console.log('[RSM] createWindow -- creating main BrowserWindow');

    mainWindow = new BrowserWindow({
        width: 1300,
        height: 1000,
        title: "Ronin Server Manager",
        icon: path.join(__dirname, 'icon.png'),
        backgroundColor: '#0f111a',
        hasShadow: true,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'public/index.html'));
    console.log('[RSM] createWindow -- window created, loading index.html');

    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // Frameless window -- the renderer's custom titlebar controls need to know
    // the real maximize state to swap the maximize/restore icon.
    const sendWindowState = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window-state-changed', { maximized: mainWindow.isMaximized() });
        }
    };
    mainWindow.on('maximize', sendWindowState);
    mainWindow.on('unmaximize', sendWindowState);
}

// --- SYSTEM TRAY CREATION & LOGIC ---
function createTray() {
    console.log('[RSM] createTray -- initializing system tray icon');
    const iconPath = path.join(__dirname, 'icon.png');
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => mainWindow.show() },
        { type: 'separator' },
        {
            label: 'Quit RoninManager', click: () => {
                app.isQuiting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Ronin Server Manager');
    tray.setContextMenu(contextMenu);
    console.log('[RSM] createTray -- tray ready, context menu registered');

    tray.on('click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });

    // Windows does not always show setContextMenu on right-click automatically
    tray.on('right-click', () => tray.popUpContextMenu(contextMenu));
}

// --- PERFORMANCE MONITORING ---
// One shared sampler asks Windows about every monitored server in a single
// query per tick (see windows-processes.js) instead of spawning tasklist + wmic
// per server. Both a freshly started server and a re-linked one use this.
const processSampler = createProcessSampler({ logicalCoreCount: os.cpus().length });

// Streams CPU/RAM for one server to the UI and the Citadel portal. When Windows
// confirms the process no longer exists, reports it offline and calls
// onProcessGone. Returns a function that stops monitoring.
function watchServerPerformance(srv, processId, onProcessGone) {
    const totalRamMB = Math.floor(os.totalmem() / 1024 / 1024);

    return processSampler.watch(processId, (sample) => {
        if (sample === null) {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('server-perf-update', { id: srv.id, cpu: 0, ramPercent: 0, ramDisplay: 'Offline' });
            }
            onProcessGone();
            return;
        }

        const memoryMB = Math.floor(sample.workingSetBytes / 1024 / 1024);
        const displayMemory = memoryMB > 1024 ? (memoryMB / 1024).toFixed(2) + ' GB' : memoryMB + ' MB';
        const ramPercent = Math.min(Math.floor((memoryMB / totalRamMB) * 100), 100);
        const cpuPercent = sample.cpuPercent ?? 0; // null on the very first tick (no earlier reading to diff against)

        serverStats[srv.id] = { cpu: cpuPercent, ramMB: memoryMB };
        roninAgent.notifyPerfUpdate(srv.id, cpuPercent, memoryMB);

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('server-perf-update', { id: srv.id, cpu: cpuPercent, ramPercent, ramDisplay: displayMemory });
            DebugCpuRam(`[RSM] Sent Update for ${srv.name}: CPU ${cpuPercent}% | RAM ${ramPercent}%`);
        }
    });
}

// --- STARTUP SYNC AND PROCESS RE-LINKING ---

// Attaches RSM monitoring to a server process that was already running before RSM started.
// Sets up the same heartbeat + log watcher that a normal start-server would create.
function relinkServer(srv, pid, serviceName = null) {
    const index = managedServers.findIndex(managedServer => managedServer.id === srv.id);
    if (index === -1) {
        console.warn(`[RSM] relinkServer -- server "${srv.name}" not found in managedServers`);
        return;
    }

    let stopPerformanceMonitoring = null;
    let logWatcher = null;

    const fakeEvent = {
        reply: (ch, data) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, data); }
    };

    const stopServerCleanup = () => {
        if (stopPerformanceMonitoring) { stopPerformanceMonitoring(); stopPerformanceMonitoring = null; }
        if (logWatcher) { clearInterval(logWatcher); logWatcher = null; }

        const restartSrv = pendingRestarts[srv.id];
        delete pendingRestarts[srv.id];
        delete activeProcesses[srv.id];
        delete serverStats[srv.id];
        const offlineIdx = managedServers.findIndex(managedServer => managedServer.id === srv.id);
        if (offlineIdx !== -1) {
            managedServers[offlineIdx].status = 'Offline';
            managedServers[offlineIdx].pid = null;
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('status-change', { id: srv.id, status: 'Offline' });
            mainWindow.webContents.send('system-info', `[RSM] ${srv.name} has stopped and is now Offline.`);
        }
        roninAgent.notifyStatusChange(srv.id, 'Offline', null);

        if (restartSrv) {
            console.log(`[RSM] relinkServer cleanup -- restarting "${restartSrv.name}"`);
            setTimeout(() => ipcMain.emit('start-server', fakeEvent, restartSrv), 1500);
        }
    };

    // Update in-memory state
    managedServers[index].pid = pid;
    managedServers[index].status = 'Online';
    activeProcesses[srv.id] = { pid, shell: null, cleanup: stopServerCleanup, startedAt: Date.now(), serviceName: serviceName || null };

    // Persist Online status so it survives a second app restart
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(managedServers, null, 2));
    } catch (error) {
        console.warn(`[RSM] relinkServer -- could not persist status for "${srv.name}":`, error.message);
    }

    // Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status-change', { id: srv.id, status: 'Online', pid });
        mainWindow.webContents.send('system-info', `[RSM] Re-linked "${srv.name}" to existing process (PID ${pid}).`);
    }
    // The Citadel agent connects immediately on app startup, but the relink
    // pass that runs this function is deliberately delayed 3s (see
    // app.whenReady()) to let the UI load first. The agent's very first
    // announce can easily fire before this relink completes, going out with
    // this server still marked Offline -- push the real state so Citadel
    // doesn't stay stuck on that stale snapshot.
    roninAgent.notifyStatusChange(srv.id, 'Online', pid);

    // Start log file watcher for POWERSHELL_BRIDGE servers (DIRECT_CONSOLE uses shell pipe, unavailable here)
    const serverCategory = findServType(srv);
    if (serverCategory !== 'DIRECT_CONSOLE' && srv.logPath && fs.existsSync(srv.logPath)) {
        logWatcher = startLogging(srv.logPath, fakeEvent, srv);
    }

    stopPerformanceMonitoring = watchServerPerformance(srv, pid, stopServerCleanup);

    console.log(`[RSM] relinkServer -- "${srv.name}" linked to PID ${pid}, monitoring started`);
}

// Four-pass scan that runs once on app startup to find servers already running.
//
// Pass 1  -- workingDir in CommandLine: precise, handles Java/script servers and any
//            game that passes its instance path as a CLI argument.
// Pass 1b -- Windows service PathName: for games launched as services, the Win32_Service
//            PathName field contains the full command line including the instance -path.
//            Needed when 3+ identical-EXE servers are running as services and Pass 1 can
//            only differentiate them by instance path in the service definition.
// Pass 2  -- netstat LISTENING port: each instance binds a unique apiPort, so the PID
//            that owns that port is unambiguous. Rejects kernel PIDs (e.g. http.sys PID 4)
//            by cross-validating against runningProcessesByExeName.
// Pass 3  -- EXE basename + order-based: last resort for truly identical CommandLines
//            where no port is available; assigns remaining servers in list order.
function syncActiveServers(isRescan = false) {
    console.log("[RSM] syncActiveServers -- scanning for pre-existing server processes...");
    if (managedServers.length === 0) {
        console.log("[RSM] syncActiveServers -- no servers configured, skipping scan");
        if (!isRescan && mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send('startup-scan-complete', { linked: 0, total: 0 });
        return;
    }

    const unlinked = new Set(managedServers.map(managedServer => managedServer.id));
    const claimedPids = new Set();

    // Group servers by EXE basename -- one WMIC query per unique executable
    const byExe = {};
    managedServers.forEach(srv => {
        if (!srv.path) return;
        const exeName = path.basename(srv.path);
        if (!byExe[exeName]) byExe[exeName] = [];
        byExe[exeName].push(srv);
    });

    const exeNames = Object.keys(byExe);
    // +1 for the parallel Windows service query (Pass 1b)
    let pending = exeNames.length + 1;
    const runningProcessesByExeName = {}; // { [exeName]: [{ cmdLine, pid }] }
    let serviceResults = []; // [{ serviceName, pathName, pid }] -- from Win32_Service for Pass 1b

    const done = () => {
        if (unlinked.size > 0) {
            const names = managedServers.filter(managedServer => unlinked.has(managedServer.id)).map(managedServer => managedServer.name).join(', ');
            console.log(`[RSM] syncActiveServers -- not found: ${names}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('system-info', `Startup scan: ${unlinked.size} server(s) not running -- ${names}`);
            }
        }
        console.log("[RSM] syncActiveServers -- scan complete");
        if (mainWindow && !mainWindow.isDestroyed()) {
            const linked = managedServers.length - unlinked.size;
            const send = () => {
                mainWindow.webContents.send('system-info', 'Startup scan complete.');
                if (!isRescan)
                    mainWindow.webContents.send('startup-scan-complete', { linked, total: managedServers.length });
            };
            // Defer if the renderer hasn't finished loading yet (unlikely with the 3s delay,
            // but possible on slow machines) so the IPC listener is guaranteed to be registered.
            if (mainWindow.webContents.isLoading()) {
                mainWindow.webContents.once('did-finish-load', send);
            } else {
                send();
            }
        }
    };

    const runPass3 = () => {
        if (unlinked.size === 0) return done();

        for (const [exeName, srvList] of Object.entries(byExe)) {
            const results = runningProcessesByExeName[exeName] || [];
            const unlinkedForExe = srvList.filter(server => unlinked.has(server.id));
            const unclaimedPids = results.map(runningProcess => runningProcess.pid).filter(processId => !claimedPids.has(processId));

            for (let index = 0; index < Math.min(unlinkedForExe.length, unclaimedPids.length); index++) {
                const srv = unlinkedForExe[index];
                const pid = unclaimedPids[index];
                claimedPids.add(pid);
                unlinked.delete(srv.id);
                console.log(`[RSM] Pass 3 -- "${srv.name}" -> PID ${pid} (order-based, EXE: ${exeName})`);
                relinkServer(srv, pid);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('system-info',
                        `[WARN] "${srv.name}" was matched to PID ${pid} by process order (Pass 3) -- if this looks wrong, check that workingDir or service name matches the instance.`);
                }
            }
        }

        done();
    };

    const runPass2 = () => {
        if (unlinked.size === 0) return done();

        const portServers = managedServers.filter(managedServer => unlinked.has(managedServer.id) && managedServer.apiPort);
        if (portServers.length === 0) return runPass3();

        execFile('netstat.exe', ['-ano'], { windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (nsErr, nsOut) => {
            if (!nsErr && nsOut) {
                const netLines = nsOut.split('\n');
                for (const srv of portServers) {
                    if (!unlinked.has(srv.id)) continue;
                    const targetPort = String(srv.apiPort);
                    // Cross-reference against WMIC results so we never accept a system-owned
                    // port. SE's VRage HTTP API registers through http.sys (a kernel driver),
                    // so netstat reports PID 4 (System) instead of the game process. Rejecting
                    // any PID that doesn't appear in the WMIC results for this EXE prevents
                    // a false match and lets the server fall through to Pass 3 instead.
                    const exeName = path.basename(srv.path);
                    const knownPids = new Set((runningProcessesByExeName[exeName] || []).map(runningProcess => runningProcess.pid));
                    for (const line of netLines) {
                        const parts = line.trim().split(/\s+/);
                        // netstat -ano columns: Proto LocalAddress ForeignAddress State PID
                        if (parts.length < 5 || parts[3] !== 'LISTENING') continue;
                        const localAddr = parts[1] || '';
                        // lastIndexOf(':') handles both 0.0.0.0:port and [::]:port formats
                        const listenPort = localAddr.substring(localAddr.lastIndexOf(':') + 1);
                        if (listenPort !== targetPort) continue;
                        const pid = parseInt(parts[4]);
                        if (isNaN(pid) || pid === 0 || claimedPids.has(pid)) continue;
                        if (!knownPids.has(pid)) continue;
                        claimedPids.add(pid);
                        unlinked.delete(srv.id);
                        console.log(`[RSM] Pass 2 -- "${srv.name}" -> PID ${pid} (port ${targetPort} match)`);
                        relinkServer(srv, pid);
                        break;
                    }
                }
            }
            runPass3();
        });
    };

    const runPasses = () => {
        // Pass 1: workingDir appears in CommandLine -- precise match for most servers
        for (const [exeName, srvList] of Object.entries(byExe)) {
            const results = runningProcessesByExeName[exeName] || [];
            for (const srv of srvList) {
                if (!unlinked.has(srv.id)) continue;
                const searchDir = (srv.workingDir || path.dirname(srv.path))
                    .toLowerCase().replace(/\\/g, '/');
                for (const { cmdLine, pid } of results) {
                    if (claimedPids.has(pid)) continue;
                    const idx = cmdLine.indexOf(searchDir);
                    if (idx === -1) continue;
                    // Boundary check: reject if the next character continues a path segment.
                    // Prevents "instance" from matching "instance2" or "instance-b".
                    const after = cmdLine[idx + searchDir.length];
                    if (after && /[a-z0-9_\-./]/.test(after)) continue;
                    claimedPids.add(pid);
                    unlinked.delete(srv.id);
                    console.log(`[RSM] Pass 1 -- "${srv.name}" -> PID ${pid} (workingDir match)`);
                    relinkServer(srv, pid);
                    break;
                }
            }
        }

        // Pass 1b: Windows service match -- handles servers launched as Windows services.
        // Two sub-strategies, tried in order:
        //   Path match -- service PathName contains both the EXE name and the instance workingDir.
        //                Works when the service was registered with the full command line.
        //   Name match -- service Name equals the last directory component of workingDir.
        //                Works for SE-style services where the service is named after the instance
        //                directory (PathName is bare EXE with no arguments).
        if (unlinked.size > 0 && serviceResults.length > 0) {
            for (const srv of managedServers) {
                if (!unlinked.has(srv.id) || !srv.path) continue;
                const exeName = path.basename(srv.path);
                const searchDir = (srv.workingDir || path.dirname(srv.path))
                    .toLowerCase().replace(/\\/g, '/');
                const instanceDirName = path.basename(srv.workingDir || path.dirname(srv.path)).toLowerCase();
                const knownPids = new Set((runningProcessesByExeName[exeName] || []).map(runningProcess => runningProcess.pid));
                for (const { serviceName, pathName, pid } of serviceResults) {
                    if (claimedPids.has(pid)) continue;
                    if (!knownPids.has(pid)) continue;
                    const normPath = pathName.toLowerCase().replace(/\\/g, '/');
                    // Must at least be running the right EXE
                    if (!normPath.includes(exeName.toLowerCase())) continue;
                    const pathMatch = normPath.includes(searchDir);
                    const nameMatch = serviceName.toLowerCase() === instanceDirName;
                    if (!pathMatch && !nameMatch) continue;
                    claimedPids.add(pid);
                    unlinked.delete(srv.id);
                    const how = pathMatch ? 'path' : 'name';
                    console.log(`[RSM] Pass 1b -- "${srv.name}" -> PID ${pid} (service ${how} match, service: "${serviceName}")`);
                    relinkServer(srv, pid, serviceName);
                    break;
                }
            }
        }

        runPass2();
    };

    // Query every running instance of each executable, plus the running Windows
    // services (Pass 1b), in parallel via PowerShell/CIM; once the last answer is
    // in (pending was initialised to exeNames.length + 1 for the service query),
    // run the passes. A failed query yields an empty list, exactly like "nothing
    // running" did before.
    exeNames.forEach(exeName => {
        listProcessesByImageName(exeName).then((processList) => {
            runningProcessesByExeName[exeName] = (processList || [])
                .filter(runningProcess => runningProcess.processId > 0)
                .map(runningProcess => ({
                    cmdLine: runningProcess.commandLine.toLowerCase().replace(/\\/g, '/'),
                    pid: runningProcess.processId,
                }));
            if (--pending === 0) runPasses();
        });
    });

    // Pass 1b data source: running Windows services -- name, path and process id.
    listRunningServices().then((serviceList) => {
        serviceResults = (serviceList || [])
            .filter(runningService => runningService.processId > 0 && (runningService.serviceName || runningService.pathName))
            .map(runningService => ({
                serviceName: runningService.serviceName,
                pathName: (runningService.pathName || '').replace(/^"|"$/g, ''),
                pid: runningService.processId,
            }));
        if (--pending === 0) runPasses();
    });
}

// --- APP LIFECYCLE EVENTS ---
app.whenReady().then(() => {
    console.log('[RSM] app.whenReady -- Electron app is ready, starting up...');
    createWindow();
    createTray();

    // Give the UI 3 seconds to load before reporting re-linked processes
    setTimeout(syncActiveServers, 3000);

    // Startup update check -- runs concurrently with the relink scan above so
    // it doesn't add extra wait on top in the common case. The renderer's init
    // overlay waits on both this and startup-scan-complete before dismissing.
    autoUpdater.checkForUpdates().catch(err => {
        console.error('[RSM] Startup update check failed:', err.message);
        _sendUpdateStatus('error', { message: err.message });
    });

    // Boot the REST API if the user has it enabled
    const apiCfg = loadApiConfig();
    if (apiCfg.enabled && apiCfg.apiKey) {
        const tls = ensureTlsCert();
        apiServer.start(apiCfg.port || 3002, apiCfg.apiKey, { key: tls.key, cert: tls.cert }, apiBindHost(apiCfg));
        console.log(`[RSM] REST API started on port ${apiCfg.port || 3002} (${apiBindHost(apiCfg)})`);
    } else {
        console.log('[RSM] REST API is disabled -- skipping startup');
    }

    // Boot the Citadel agent if configured
    const citadelCfg = loadCitadelConfig();
    if (citadelCfg.enabled && citadelCfg.portalUrl && citadelCfg.agentToken && citadelCfg.orgSlug && citadelCfg.machSlug) {
        roninAgent.start(citadelCfg.portalUrl, citadelCfg.agentToken, citadelCfg.citadelApiUrl, citadelCfg.orgSlug, citadelCfg.machSlug);
        console.log('[RSM] Citadel agent started');
    } else {
        console.log('[RSM] Citadel agent disabled -- skipping startup');
    }
});

app.on('window-all-closed', () => {
    console.log('[RSM] window-all-closed -- quitting app');
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    console.log('[RSM] will-quit -- stopping API server and shutting down');
    apiServer.stop();
    roninAgent.stop();
});

// Clear any previously registered startup entry so the app only launches on
// boot when the user explicitly enables it in Settings.
app.setLoginItemSettings({ openAtLogin: false });


//      ____    _  _____  _       _        _ __   ____  ____
//     |  _ \  / \|_   _|/ \     | |      / \\ \ / /  _\ |  _ \
//     | | | |/ _ \ | | / _ \    | |     / _ \\ V /| |_) | |_) |
//     | |_| / ___ \| |/ ___ \   | |___ / ___ \| | |  __/|  __/
//     |____/_/   \_\_/_/   \_\  |_____/_/   \_\_| |_|   |_|
//

// --- SERVER LIST LOADING ---
function loadServers() {
    console.log('[RSM] loadServers -- reading servers.json from', DATA_FILE);
    if (fs.existsSync(DATA_FILE)) {
        try {
            const servers = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            // Always start with every server Offline -- syncActiveServers() will
            // re-link any that are genuinely still running after the app loads.
            const result = servers.map(server => ({ ...server, status: 'Offline', pid: null }));
            console.log(`[RSM] loadServers -- loaded ${result.length} server(s)`);
            return result;
        } catch (error) {
            console.error("[RSM] Failed to load servers.json:", error);
            return [];
        }
    }
    console.log('[RSM] loadServers -- no servers.json found, starting fresh');
    return [];
}

// --- LIVE RELOAD WHEN servers.json IS EDITED EXTERNALLY ---
// Detects when a 3rd-party tool injects or removes servers by writing directly
// to servers.json, then pushes the updated list to the renderer without requiring
// a restart. Only fires when the set of server IDs actually changes.
(function watchServersFile() {
    const dataDir      = path.dirname(DATA_FILE);
    const dataBasename = path.basename(DATA_FILE);
    let debounce       = null;

    const reloadIfChanged = () => {
        if (!fs.existsSync(DATA_FILE)) return;
        try {
            const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            if (!Array.isArray(raw)) return;

            const currentIds = new Set(managedServers.map(managedServer => managedServer.id));
            const fileIds    = new Set(raw.map(fileServer => fileServer.id));
            const hasNew     = raw.some(fileServer => !currentIds.has(fileServer.id));
            const hasRemoved = managedServers.some(managedServer => !fileIds.has(managedServer.id));
            if (!hasNew && !hasRemoved) return;

            managedServers = raw.map(fileServer => {
                const existing = managedServers.find(existingServer => existingServer.id === fileServer.id);
                if (existing) return { ...fileServer, status: existing.status, pid: existing.pid, logs: existing.logs || fileServer.logs };
                return { ...fileServer, status: 'Offline', pid: null };
            });

            const win = mainWindow;
            if (win && !win.isDestroyed()) win.webContents.send('servers-updated', managedServers);
            console.log(`[RSM] servers.json changed externally — reloaded ${managedServers.length} server(s)`);
        } catch (error) {
            console.error('[RSM] Failed to reload servers.json after external edit:', error);
        }
    }

    fs.watch(dataDir, (event, filename) => {
        if (filename !== dataBasename) return;
        clearTimeout(debounce);
        debounce = setTimeout(reloadIfChanged, 300);
    });
})();

// --- API CONFIG LOAD / SAVE ---
function loadApiConfig() {
    if (fs.existsSync(API_CONFIG_FILE)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(API_CONFIG_FILE, 'utf8'));
            const storedApiKey = cfg.apiKey;
            cfg.apiKey = secretStore.reveal(storedApiKey);
            console.log('[RSM] loadApiConfig -- loaded:', { enabled: cfg.enabled, port: cfg.port });
            // Upgrade a plaintext key written by an older version.
            if (storedApiKey && !secretStore.isEncrypted(storedApiKey) && secretStore.isAvailable()) {
                try { fs.writeFileSync(API_CONFIG_FILE, JSON.stringify({ ...cfg, apiKey: secretStore.protect(cfg.apiKey) }, null, 2)); } catch (error) { console.warn('[RSM] Could not encrypt api-config.json:', error.message); }
            }
            return cfg;
        } catch (error) {
            console.error('[RSM] Failed to load api-config.json:', error);
        }
    }
    return { enabled: false, port: 3002, apiKey: '', lanAccess: false };
}

// Resolve the interface the REST API binds to. Loopback by default; only expose
// to the LAN (0.0.0.0) when the operator has explicitly enabled lanAccess.
function apiBindHost(cfg) {
    return cfg && cfg.lanAccess ? '0.0.0.0' : '127.0.0.1';
}

function saveApiConfig(config) {
    console.log('[RSM] saveApiConfig -- saving:', { enabled: config.enabled, port: config.port });
    fs.writeFileSync(API_CONFIG_FILE, JSON.stringify({ ...config, apiKey: secretStore.protect(config.apiKey) }, null, 2));
    // Write a convenience file ArkenBot / external tools can read to get the key and cert fingerprint
    try {
        const tls        = ensureTlsCert();
        const rsmApiPath = path.join(app.getPath('appData'), 'rsm-api.json');
        fs.writeFileSync(rsmApiPath, JSON.stringify({
            url:         `https://localhost:${config.port || 3002}`,
            apiKey:      config.apiKey || '',
            port:        config.port || 3002,
            fingerprint: tls.fingerprint
        }, null, 2));
    } catch (error) {
        console.warn('[RSM] Could not write rsm-api.json:', error.message);
    }
}

// Generates (or loads from cache) a self-signed TLS cert for the REST API.
// Returns { key, cert, fingerprint } -- fingerprint is SHA-256 in AA:BB:CC format.
function ensureTlsCert() {
    if (fs.existsSync(TLS_CERT_FILE) && fs.existsSync(TLS_KEY_FILE)) {
        try {
            const cert = fs.readFileSync(TLS_CERT_FILE, 'utf8');
            const key  = fs.readFileSync(TLS_KEY_FILE,  'utf8');
            const x509 = new crypto.X509Certificate(cert);
            return { key, cert, fingerprint: x509.fingerprint256 };
        } catch (error) {
            console.warn('[RSM-TLS] Could not read existing cert, regenerating:', error.message);
        }
    }

    const selfsigned = require('selfsigned');
    const attrs = [{ name: 'commonName', value: 'ronin-server-manager' }];
    const pems  = selfsigned.generate(attrs, { days: 3650, algorithm: 'sha256', keySize: 2048 });

    fs.writeFileSync(TLS_CERT_FILE, pems.cert, { mode: 0o600 });
    fs.writeFileSync(TLS_KEY_FILE,  pems.private, { mode: 0o600 });

    const x509 = new crypto.X509Certificate(pems.cert);
    console.log(`[RSM-TLS] Generated new TLS cert. Fingerprint: ${x509.fingerprint256}`);
    return { key: pems.private, cert: pems.cert, fingerprint: x509.fingerprint256 };
}

// --- GET SERVER LIST ---
ipcMain.handle('get-servers', () => {
    console.log(`[RSM] get-servers -- returning ${managedServers.length} server(s)`);
    return managedServers;
});

// --- SAVE SERVER LIST (with persistence logic for running servers) ---
ipcMain.on('save-servers', (event, updatedList) => {
    console.log(`[RSM] save-servers -- merging ${updatedList.length} server(s) and persisting`);
    managedServers = updatedList.map(newSrv => {
        const existing = managedServers.find(managedServer => managedServer.id === newSrv.id);
        return {
            ...newSrv,
            pid: existing ? existing.pid : null,
            status: existing ? existing.status : 'Offline',
            logs: existing ? existing.logs : ""
        };
    });

    fs.writeFileSync(DATA_FILE, JSON.stringify(managedServers, null, 2));
    console.log("[RSM] Server list saved (Persistence maintained for active servers).");
});

// --- CONSOLE OUTPUT HELPER ---
// Sends console output to the renderer AND appends to the managedServer log buffer
// so the REST API /logs endpoint always has current content.
const MAX_LOG_LINES = 500;
function sendConsoleOut(event, id, msg) {
    event.reply('console-out', { id, msg });
    // Forward to the Citadel portal SSE stream (no-op if the agent is offline).
    roninAgent.notifyConsoleOutput(id, msg);
    const idx = managedServers.findIndex(managedServer => managedServer.id === id);
    if (idx === -1) return;
    const current = managedServers[idx].logs || '';
    const combined = current + msg;
    const lines = combined.split('\n');
    managedServers[idx].logs = lines.slice(-MAX_LOG_LINES).join('\n');
}

// --- LAUNCH ON STARTUP TOGGLE ---
ipcMain.on('update-startup-settings', (event, isEnabled) => {
    app.setLoginItemSettings({
        openAtLogin: isEnabled,
        path: app.getPath('exe')
    });
    console.log(`[RSM] Launch on startup set to: ${isEnabled}`);
});

// --- API SERVER SETTINGS ---
ipcMain.handle('get-api-config', () => loadApiConfig());

ipcMain.on('save-api-config', (event, config) => {
    console.log(`[RSM] save-api-config -- enabled: ${config.enabled} | port: ${config.port}`);
    saveApiConfig(config);
    if (config.enabled && config.apiKey) {
        const tls = ensureTlsCert();
        apiServer.start(config.port || 3002, config.apiKey, { key: tls.key, cert: tls.cert }, apiBindHost(config));
    } else {
        apiServer.stop();
    }
    console.log(`[RSM] API server ${config.enabled ? `started on port ${config.port}` : 'stopped'}.`);
});

ipcMain.handle('regenerate-api-key', () => {
    console.log('[RSM] regenerate-api-key -- generating new API key');
    const config = loadApiConfig();
    config.apiKey = apiServer.generateApiKey();
    if (!config.port) config.port = 3002;
    saveApiConfig(config);
    if (config.enabled) {
        const tls = ensureTlsCert();
        apiServer.start(config.port, config.apiKey, { key: tls.key, cert: tls.cert }, apiBindHost(config));
    }
    console.log('[RSM] API key regenerated.');
    return config;
});

// --- ADMIN CHECK ---
// fltmc.exe (filter manager control) only succeeds for an elevated process and,
// unlike the old `net session`, does not depend on the Server service running --
// `net session` reported "not Administrator" whenever that service was stopped.
function _isElevated() {
    return new Promise((resolve) => {
        execFile('fltmc.exe', [], { windowsHide: true }, (error) => resolve(!error));
    });
}

ipcMain.handle('check-admin', async () => {
    console.log('[RSM] check-admin -- checking for Administrator privileges');
    const isAdmin = await _isElevated();
    console.log(`[RSM] check-admin -- result: ${isAdmin ? 'Administrator' : 'Standard user'}`);
    return isAdmin;
});

// Tests whether this (possibly unelevated) process can actually terminate the
// target PID, via a direct OpenProcess(PROCESS_TERMINATE) probe -- the same check
// Windows itself performs. This catches servers running at a higher integrity
// level (e.g. started elevated) that Stop-Process/taskkill would silently fail
// against, so the UI can tell the user to restart RSM as Administrator instead
// of pretending the stop worked.
async function _canTerminateProcess(rawProcessId) {
    const processId = parseProcessId(rawProcessId);
    // Fail-open on diagnostic problems -- never block a stop attempt that might
    // otherwise have worked just because this probe itself couldn't run.
    if (processId === null) return true;

    const probeResult = await runPowerShellScript(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class RsmProcAccess {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);
    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr hObject);
}
'@
$handle = [RsmProcAccess]::OpenProcess(0x0001, $false, ${processId})
if ($handle -ne [IntPtr]::Zero) { [RsmProcAccess]::CloseHandle($handle) | Out-Null; Write-Output 'YES' } else { Write-Output 'NO' }`.trim());

    if (probeResult.error || !probeResult.stdout) return true;
    return probeResult.stdout.trim().includes('YES');
}


//      _        _   _   _ _   _  ____ _   _   ____  _____ ______     _______ ____
//     | |      / \ | | | | \ | |/ ___| | | | / ___|| ____|  _ \ \   / / ____|  _ \
//     | |     / _ \| | | |  \| | |   | |_| | \___ \|  _| | |_) \ \ / /|  _| | |_) |
//     | |___ / ___ \ |_| | |\  | |___|  _  |  ___) | |___|  _ < \ V / | |___|  _ <
//     |_____/_/   \_\___/|_| \_|\____|_| |_| |____/|_____|_| \_\ \_/  |_____|_| \_\
//

// --- SERVER START LOGIC ---
ipcMain.on('start-server', (event, srv) => {
    console.log(`[RSM] start-server -- name: "${srv.name}" | type: ${srv.type} | category: ${findServType(srv)}`);
    event.reply('system-info', `[RSM] Gathering information for: ${srv.name}`);
    DebugLog(`Starting server with config:`, srv);

    srv.status = 'Starting';
    srv.pid = null;
    const workingDir = srv.workingDir || path.dirname(srv.path);
    const exeName = path.basename(srv.path);
    const serverCategory = findServType(srv);
    const argArray = srv.args ? srv.args.split(' ').filter(argument => argument.trim() !== "") : [];
    const psArgs = escapePowerShellLiteral(argArray.join(' '));

    let child;
    let actualGamePid = 0;
    let searchRetry = null;
    let stopPerformanceMonitoring = null;
    let logWatcher = null;
    if (DebugActive) console.log('[RSM-DEBUG] reset server to default state');

    function finalizeProcess(pid) {
        if (srv.status === 'Online' && srv.pid === pid) return;
        DebugLog(`Finalizing process for ${srv.name}: PID ${pid}`);

        if (searchRetry) {
            clearInterval(searchRetry);
            searchRetry = null;
            DebugLog(`Stopped search retry interval after finding PID ${pid}.`);
        }

        actualGamePid = pid;
        srv.pid = pid;
        srv.status = 'Online';

        const index = managedServers.findIndex(managedServer => managedServer.id === srv.id);
        if (index !== -1) {
            managedServers[index].pid = pid;
            managedServers[index].status = 'Online';
            event.reply('system-info', `[RSM] ${srv.name} is now Online with PID ${pid}.`);
            DebugLog(`Updated managedServers entry for ${srv.name}`);
        } else {
            event.reply('system-info', `[RSM-WARN] Could not find ${srv.name} in managedServers to update PID and status.`);
            if (DebugActive) console.warn(`[RSM-DEBUG] Could not find ${srv.name} in managedServers to update PID and status.`);
        }

        event.reply('status-change', { id: srv.id, status: 'Online', pid: pid });
        roninAgent.notifyStatusChange(srv.id, 'Online', pid);

        if (serverCategory !== 'DIRECT_CONSOLE') {
            if (!logWatcher && srv.logPath) {
                logWatcher = startLogging(srv.logPath, event, srv);
                if (!logWatcher) DebugLog(`[RSM-DEBUG] Log watcher not started yet for ${srv.name} — log file may not exist yet.`);
            }
        } else {
            DebugLog(`[RSM-DEBUG] ${srv.name} is a UI based server. Using shell pipe instead of file watcher.`);
        }

        activeProcesses[srv.id] = { pid: pid, shell: child, cleanup: stopServerCleanup, startedAt: Date.now() };
        DebugLog(`Registered ${srv.name} in activeProcesses.`);

        startHeartbeat(pid, srv);
    }

    const stopServerCleanup = () => {
        DebugLog(`Initiating cleanup for ${srv.name}...`);

        if (stopPerformanceMonitoring) {
            stopPerformanceMonitoring();
            stopPerformanceMonitoring = null;
            DebugLog(`Stopped heartbeat monitor for ${srv.name}.`);
        }

        if (logWatcher) {
            clearInterval(logWatcher);
            logWatcher = null;
            DebugLog(`Stopped log watcher for ${srv.name}.`);
        }

        if (searchRetry) {
            clearInterval(searchRetry);
            searchRetry = null;
            DebugLog(`Stopped search retry interval for ${srv.name}.`);
        }

        const restartSrv = pendingRestarts[srv.id];
        delete pendingRestarts[srv.id];
        delete activeProcesses[srv.id];
        delete serverStats[srv.id];
        const offlineIdx = managedServers.findIndex(managedServer => managedServer.id === srv.id);
        if (offlineIdx !== -1) {
            managedServers[offlineIdx].status = 'Offline';
            managedServers[offlineIdx].pid = null;
        }
        event.reply('status-change', { id: srv.id, status: 'Offline' });
        event.reply('system-info', `[RSM] ${srv.name} has been cleaned up and set to Offline.`);
        roninAgent.notifyStatusChange(srv.id, 'Offline', null);

        if (restartSrv) {
            console.log(`[RSM] restart-server -- restarting "${restartSrv.name}" after cleanup`);
            setTimeout(() => ipcMain.emit('start-server', {
                reply: (ch, data) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, data); }
            }, restartSrv), 1500);
        }

        DebugLog(`Cleanup complete for ${srv.name}. Status: Offline.`);
    };

    const startHeartbeat = (pid, serverObject) => {
        if (stopPerformanceMonitoring) stopPerformanceMonitoring();
        if (!pid) return;
        stopPerformanceMonitoring = watchServerPerformance(serverObject, pid, stopServerCleanup);
    };

    if (DebugActive) console.log("[RSM-DEBUG] Category identified as:", serverCategory);

    if (serverCategory === 'DIRECT_CONSOLE') {
        const isJar = srv.path.toLowerCase().endsWith('.jar');
        const command = isJar ? 'java' : srv.path;
        let finalArgs = isJar ? ['-jar', srv.path] : [];
        finalArgs = [...finalArgs, ...argArray];
        if (srv.type.toLowerCase() === 'minecraft' && !finalArgs.includes('--nogui')) finalArgs.push('--nogui');

        child = spawn(command, finalArgs, { cwd: workingDir, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
        DebugLog(`Launched direct process for ${srv.name} with PID ${child.pid}`);
    } else {
        const argumentListClause = psArgs === '' ? '' : ` -ArgumentList '${psArgs}'`;
        const psScript = `$p = Start-Process -FilePath '${escapePowerShellLiteral(srv.path)}'${argumentListClause} -WorkingDirectory '${escapePowerShellLiteral(workingDir)}' -WindowStyle Hidden -PassThru; Write-Output "PID_MARKER:$($p.Id)"; while($null -ne (Get-Process -Id $p.Id -ErrorAction SilentlyContinue)) { Start-Sleep -Seconds 5 }`;
        const encodedCmd = Buffer.from(psScript, 'utf16le').toString('base64');
        child = spawn('powershell.exe', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCmd
        ], { cwd: workingDir, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
        DebugLog(`Launched PowerShell bridge for ${srv.name} with PID ${child.pid}`);
    }

    // For POWERSHELL_BRIDGE servers, poll for the log file during startup so output appears immediately
    if (serverCategory !== 'DIRECT_CONSOLE' && srv.logPath) {
        const startupPoller = setInterval(() => {
            if (logWatcher) { clearInterval(startupPoller); return; }
            const watcher = startLogging(srv.logPath, event, srv);
            if (watcher) {
                logWatcher = watcher;
                clearInterval(startupPoller);
                DebugLog(`Startup log poller found log for ${srv.name}, watcher started.`);
            }
        }, 2000);
        // Stop polling if the server never comes up
        setTimeout(() => {
            clearInterval(startupPoller);
            if (!logWatcher) {
                const msg = `[RSM-WARN] "${srv.name}" -- console readout never started (no .log file appeared within 5 minutes). Console output will stay empty for this run.`;
                console.log(msg);
                event.reply('system-info', msg);
            }
        }, 300000);
    }

    child.stdout.on('data', (data) => {
        let msg = data.toString();
        if (!msg.endsWith('\n')) msg += '\n';

        DebugConsoleLogs(`[STDOUT][${srv.name}]: ${msg.trim()}`);

        if (serverCategory === 'DIRECT_CONSOLE') {
            sendConsoleOut(event, srv.id, msg);
        }

        if (msg.includes('PID_MARKER:')) {
            const pidMatch = msg.match(/PID_MARKER:(\d+)/);
            if (pidMatch && pidMatch[1]) {
                const foundPid = parseInt(pidMatch[1]);
                if (srv.pid !== foundPid) {
                    finalizeProcess(foundPid);
                } else {
                    DebugLog(`PID ${foundPid} already finalized. Skipping loop.`);
                }
            } else if (DebugActive) {
                DebugLog(`PID marker not found in message: ${msg.trim()}`);
            }
        }
    });

    let inCliXml = false;
    child.stderr.on('data', (data) => {
        let msg = data.toString();
        if (DebugActive) console.log(`[STDERR][${srv.name}]: ${msg.trim()}`);

        // PowerShell serializes its Error/Warning/Progress/Verbose streams as
        // CliXml whenever stderr is redirected to a pipe rather than a real
        // console -- which is always true for this bridge, not an edge case.
        // The old check only matched the opening '#< CLIXML' line; a payload
        // spanning multiple stream 'data' events (e.g. "preparing modules"
        // progress records) leaked its remaining raw <Objs>...</Objs> XML
        // straight into the user-facing console. Track state across chunks
        // so the whole block is suppressed, not just its first line.
        if (!inCliXml && msg.trim().startsWith('#< CLIXML')) inCliXml = true;
        if (inCliXml) {
            if (msg.includes('</Objs>')) inCliXml = false;
            return;
        }

        sendConsoleOut(event, srv.id, `[WARN] ${msg}`);
    });

    child.on('close', (code) => {
        DebugLog(`PowerShell bridge for ${srv.name} closed with code ${code}.`);
        if (srv.status !== 'Online') {
            event.reply('system-info', `[RSM-ERR] Bridge process for "${srv.name}" exited before the server came Online (code: ${code}). Check that the path is correct and try running RSM as Administrator.`);
            const bridgeIdx = managedServers.findIndex(managedServer => managedServer.id === srv.id);
            if (bridgeIdx !== -1) { managedServers[bridgeIdx].status = 'Offline'; managedServers[bridgeIdx].pid = null; }
            event.reply('status-change', { id: srv.id, status: 'Offline' });
            if (searchRetry) { clearInterval(searchRetry); searchRetry = null; }
        }
    });

    setTimeout(() => {
        if (!child || !child.pid) return;
        if (actualGamePid === 0) {
            if (serverCategory === 'DIRECT_CONSOLE') {
                finalizeProcess(child.pid);
            } else {
                searchRetry = setInterval(() => {
                    if (srv.status !== 'Online') {
                        performSearch(child.pid, exeName, workingDir, finalizeProcess);
                    } else {
                        DebugLog(`Search stopped: ${srv.name} is Online.`);
                        clearInterval(searchRetry);
                        searchRetry = null;
                    }
                }, 3000);
            }
        }
    }, 5000);
});


//      ____  _____ ___  ____    ____  _____ ______     _______ ____
//     / ___|_   _/ _ \|  _ \  / ___|| ____|  _ \ \   / / ____|  _ \
//     \___ \ | || | | | |_) | \___ \|  _| | |_) \ \ / /|  _| | |_) |
//      ___) || || |_| |  __/   ___) | |___|  _ < \ V / | |___|  _ <
//     |____/ |_| \___/|_|     |____/|_____|_| \_\ \_/  |_____|_| \_\
//

// --- SERVER STOP LOGIC ---

const DEFAULT_GRACEFUL_STOP_SECONDS = 60;

// Runs a Windows tool directly (no shell, so no quoting/injection concerns).
// Resolves { error, stdout, stderr } and never rejects.
function runExecutable(executableName, argumentList) {
    return new Promise((resolve) => {
        execFile(executableName, argumentList, { windowsHide: true, timeout: 60_000 }, (error, stdout, stderr) => {
            resolve({ error, stdout: stdout || '', stderr: stderr || '' });
        });
    });
}

// signal 0 tests for existence without touching the process. EPERM means it
// exists but belongs to someone we may not signal -- still running.
function isProcessRunning(processId) {
    try {
        process.kill(processId, 0);
        return true;
    } catch (error) {
        return error.code === 'EPERM';
    }
}

async function waitForProcessExit(processId, timeoutMilliseconds) {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
        if (!isProcessRunning(processId)) return true;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return !isProcessRunning(processId);
}

// The game's own config says how to ask it to save and quit (backend.gracefulStop).
// Looked up at stop time so a config fix applies to servers saved long ago.
async function lookupGracefulStopPlan(srv) {
    try {
        const registry = await loadRegistry();
        return (registry[srv.type] && registry[srv.type].backend && registry[srv.type].backend.gracefulStop) || null;
    } catch {
        return null;
    }
}

ipcMain.on('stop-server', async (event, srvId) => {
    console.log(`[RSM] stop-server -- srvId: ${srvId}`);
    DebugLog(`Received stop-server request for ID: ${srvId}`);
    event.reply('system-info', `[RSM] Stop signal received for: ${srvId}`);

    let processInfo = activeProcesses[srvId] || activeProcesses[String(srvId)];
    DebugLog(`Initial lookup for ${srvId}:`, processInfo ? `PID ${processInfo.pid}` : "Not found");

    if (!processInfo) {
        const foundKey = Object.keys(activeProcesses).find(key =>
            String(activeProcesses[key].pid) === String(srvId)
        );
        if (foundKey) processInfo = activeProcesses[foundKey];
        DebugLog(`Attempted alternative lookup for ${srvId}. Found key: ${foundKey || "None"}`);
    }

    if (!processInfo || !processInfo.pid) {
        event.reply('system-info', `[RSM-WARN] Stop failed: No active process found for ${srvId}`);
        DebugLog(`No process info found for ${srvId}. Active processes:`, activeProcesses);
        return;
    }

    const { shell, cleanup, serviceName } = processInfo;
    const pid = parseProcessId(processInfo.pid);
    if (pid === null) {
        event.reply('system-info', `[RSM-WARN] Stop failed: invalid process id for ${srvId}`);
        return;
    }
    const resolvedServerId = Object.keys(activeProcesses).find(key => activeProcesses[key] === processInfo);
    const srv = managedServers.find(managedServer => managedServer.id === resolvedServerId);
    const srvName = srv ? srv.name : srvId;

    // Some servers end up running at a higher integrity level than RSM (e.g.
    // launched elevated by something else). Stop-Process/taskkill silently fail
    // against those, so probe first and tell the user why instead of pretending.
    if (!(await _canTerminateProcess(pid)) && !(await _isElevated())) {
        console.log(`[RSM] stop-server -- PID ${pid} requires elevation, RSM is not elevated. Aborting.`);
        event.reply('elevation-required', { srvId, srvName, pid });
        event.reply('system-info', `[RSM-WARN] "${srvName}" is running with elevated permissions RSM does not have. Restart RSM as Administrator to manage it.`);
        // restart-server sets pendingRestarts before calling stop-server, expecting
        // cleanup() to consume it once the process actually exits. Since cleanup()
        // never runs on this early-return path, clear it here too -- otherwise a
        // blocked restart silently fires later, whenever this server is next
        // stopped through some other path (e.g. after RSM is relaunched elevated).
        if (pendingRestarts[srvId]) {
            delete pendingRestarts[srvId];
            event.reply('system-info', `[RSM] Restart for "${srvName}" cancelled -- elevation required.`);
        }
        return;
    }

    event.reply('system-info', `[RSM] Identifying PID ${pid}. Sending graceful shutdown sequence...`);
    DebugLog(`Preparing to stop PID ${pid} -- shell: ${!!shell}, service: ${serviceName || 'none'}`);

    // Step 1: ask the game to save and exit using the method its config declares.
    // This replaces a fixed "/save-all /stop /exit" that was written to EVERY
    // console server (wrong for all but Minecraft) followed by a 2-second wait
    // and a hard kill -- too short for any real world save. Servers started as
    // Windows services are left to the service manager (step 2) so its recovery
    // settings don't restart them behind our back.
    const stopPlan = (!serviceName && srv) ? await lookupGracefulStopPlan(srv) : null;
    if (stopPlan) {
        event.reply('system-info', `[RSM] Asking "${srvName}" to save and shut down (${stopPlan.transport})...`);
        try {
            await serverProtocols.requestGracefulStop(srv, stopPlan, { standardInput: shell && shell.stdin });
            const gracePeriodSeconds = stopPlan.timeoutSeconds || DEFAULT_GRACEFUL_STOP_SECONDS;
            event.reply('system-info', `[RSM] Stop request delivered. Waiting up to ${gracePeriodSeconds}s for PID ${pid} to exit...`);
            if (await waitForProcessExit(pid, gracePeriodSeconds * 1000)) {
                event.reply('system-info', `[RSM] PID ${pid} exited cleanly.`);
                if (typeof cleanup === 'function') cleanup();
                return;
            }
            event.reply('system-info', `[RSM-WARN] "${srvName}" did not exit within ${gracePeriodSeconds}s -- closing it now.`);
        } catch (error) {
            event.reply('system-info', `[RSM-WARN] Graceful stop request failed (${error.message}) -- falling back to closing the process.`);
        }
    }

    // Confirms the process has actually exited before declaring it Offline. A stop
    // command succeeding only means the signal was accepted -- SCM stop is async,
    // and a stale/wrong PID (e.g. from a Pass 3 order-based relink match) silently
    // no-ops. If it is still alive here, leave cleanup to the performance monitor
    // (which sees the process disappear) instead of lying about the state.
    const confirmAndCleanup = async (waitSeconds) => {
        if (await waitForProcessExit(pid, waitSeconds * 1000)) {
            event.reply('system-info', `[RSM] PID ${pid} confirmed stopped.`);
            if (typeof cleanup === 'function') cleanup();
        } else {
            event.reply('system-info', `[RSM-WARN] PID ${pid} is still running after the stop request -- it may still be shutting down, or Force Kill may be needed.`);
        }
    };

    // Step 2: Service stop (servers re-linked from a Windows service) or a polite
    // window close followed by a forced stop (servers started directly by RSM).
    if (serviceName) {
        // Proper SCM stop -- prevents the service from auto-restarting
        event.reply('system-info', `[RSM] Stopping Windows service "${serviceName}"...`);
        const serviceStop = await runExecutable('sc.exe', ['stop', serviceName]);
        if (serviceStop.error) {
            event.reply('system-info', `[RSM-WARN] sc stop failed, falling back to Stop-Process: ${serviceStop.stderr || serviceStop.stdout || serviceStop.error.message}`);
            await runPowerShellScript(`Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`);
            await confirmAndCleanup(10);
        } else {
            event.reply('system-info', `[RSM] Service "${serviceName}" stop signal sent.`);
            await confirmAndCleanup(30);
        }
    } else {
        // CloseMainWindow only works for processes that have a window; give those
        // up to 15 s to save and exit before forcing. Headless servers have no
        // window, so go straight to the forced stop rather than waiting for nothing.
        const closeOutcome = await runPowerShellScript(
            `$target = Get-Process -Id ${pid} -ErrorAction SilentlyContinue\n` +
            `if ($target) {\n` +
            `    if ($target.CloseMainWindow()) { [void]$target.WaitForExit(15000) }\n` +
            `    if (-not $target.HasExited) { Stop-Process -Id ${pid} -Force }\n` +
            `}`
        );
        if (closeOutcome.error) {
            event.reply('system-info', `[RSM-DEBUG] OS Signal Feedback: ${closeOutcome.stderr.trim() || "Process may have already closed."}`);
        } else {
            event.reply('system-info', `[RSM] Windows OS has acknowledged the stop request for PID ${pid}.`);
        }
        await confirmAndCleanup(10);
    }
});

// --- FORCE KILL LOGIC ---
ipcMain.on('kill-server', async (event, rawProcessId) => {
    console.log(`[RSM] kill-server -- PID: ${rawProcessId}`);
    const pid = parseProcessId(rawProcessId);
    if (pid === null) {
        event.reply('system-info', '[RSM-WARN] Force kill ignored: invalid process id.');
        return;
    }

    // Look up service name in case this process is a Windows service --
    // sc stop prevents SCM from auto-restarting it after taskkill
    const processEntry = Object.entries(activeProcesses).find(([, processInfo]) => processInfo.pid === pid);
    const serviceName = processEntry?.[1]?.serviceName || null;

    // Same elevation boundary as stop-server -- taskkill fails silently (non-zero
    // exit, already surfaced above) against a higher-integrity process, so tell
    // the user why up front instead of leaving them with a generic error.
    if (!(await _canTerminateProcess(pid)) && !(await _isElevated())) {
        const srvId   = processEntry?.[0];
        const srvName = managedServers.find(managedServer => managedServer.id === srvId)?.name || `PID ${pid}`;
        console.log(`[RSM] kill-server -- PID ${pid} requires elevation, RSM is not elevated. Aborting.`);
        event.reply('elevation-required', { srvId, srvName, pid });
        event.reply('system-info', `[RSM-WARN] "${srvName}" is running with elevated permissions RSM does not have. Restart RSM as Administrator to manage it.`);
        return;
    }

    if (serviceName) {
        event.reply('system-info', `[RSM] Stopping service "${serviceName}" before force kill...`);
        await runExecutable('sc.exe', ['stop', serviceName]);
    } else {
        event.reply('system-info', `[RSM] Sending force kill to PID ${pid}...`);
    }

    const killOutcome = await runExecutable('taskkill.exe', ['/F', '/T', '/PID', String(pid)]);
    if (killOutcome.error) {
        console.error(`[RSM] kill-server -- taskkill failed for PID ${pid}:`, killOutcome.error.message);
        event.reply('system-info', `[RSM-WARN] Force kill failed for PID ${pid}: ${killOutcome.stderr.trim() || killOutcome.error.message}`);
    } else {
        console.log(`[RSM] kill-server -- process tree ${pid} force terminated`);
        const killedEntry = Object.entries(activeProcesses).find(([, processInfo]) => processInfo.pid === pid);
        if (killedEntry) killedEntry[1].cleanup();
    }
});

// --- MANUAL RE-SCAN ---
ipcMain.on('resync-servers', () => {
    console.log('[RSM] resync-servers -- manual re-scan triggered');
    if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('system-info', '[RSM] Manual re-scan started...');
    syncActiveServers(true);
});

// --- RESTART LOGIC ---
// Sets a pendingRestarts flag on the server, then fires stop-server.
// stopServerCleanup (in the start-server closure) detects the flag on process exit
// and re-emits start-server after a short delay -- no polling required.
ipcMain.on('restart-server', (event, srvId) => {
    console.log(`[RSM] restart-server -- srvId: ${srvId}`);
    const srv = managedServers.find(managedServer => managedServer.id === srvId);
    if (!srv) {
        console.warn(`[RSM] restart-server -- server ${srvId} not found`);
        event.reply('system-info', `[RSM-WARN] Restart failed: server not found`);
        return;
    }
    if (srv.status === 'Offline') {
        // Already stopped -- skip the stop step and start directly
        console.log(`[RSM] restart-server -- "${srv.name}" is Offline, starting directly`);
        ipcMain.emit('start-server', event, { ...srv });
        return;
    }
    pendingRestarts[srvId] = { ...srv };
    ipcMain.emit('stop-server', event, srvId);
    event.reply('system-info', `[RSM] Restart initiated for "${srv.name}" -- stopping first...`);
});


//      ___ ___  _   _ ____  ___  _     _____     ____  ___  __  __ __  __    _    _   _ ____  ____
//     / __/ _ \| \ | / ___||_ _|| |   | ____|   / ___/ _ \|  \/  |  \/  |  / \  | \ | |  _ \/ ___|
//    | (_| | | |  \| \___ \ | | | |   |  _|    | |  | | | | |\/| | |\/| | / _ \ |  \| | | | \___ \
//    \__ | |_| | |\  |___) || | | |___| |___   | |__| |_| | |  | | |  | |/ ___ \| |\  | |_| |___) |
//    |___/\___/|_| \_|____/|___||_____|_____|   \____\___/|_|  |_|_|  |_/_/   \_|_| \_|____/|____/
//

// --- LOG TAILING FUNCTION ---
const startLogging = (logFolderPath, event, srv) => {
    // Was keyed 'spaceengineers' (no hyphen), which never matched the real
    // type string 'space-engineers' and silently fell through to 'utf8' on
    // every server -- masking the fact that the entry itself was also wrong.
    // Verified against a real SpaceEngineersDedicated_*.log via hex dump
    // (plain single-byte ASCII, e.g. "2026-08-22..." with no interleaved
    // NUL bytes and no BOM): SE's dedicated-server logs are plain UTF-8, not
    // UTF-16LE. There is currently no game in this app whose log needs
    // anything other than 'utf8' -- keep this map only as a documented
    // extension point if that ever changes.
    const encodingMap = {
        'default': 'utf8'
    };

    const selectedEncoding = encodingMap[srv.type?.toLowerCase()] || encodingMap['default'];

    // Per-game noise patterns, declared in that game's own config
    // (backend.logNoisePatterns) and copied onto srv at registration --
    // same mechanism as playerListCommand. Each is a lowercase substring
    // checked against the line's real content -- NOT against the '| '
    // prefix the transform below adds, since that only exists on lines that
    // already survived this filter (raw lines are always
    // "TIMESTAMP - Thread: N -> MESSAGE", never "| MESSAGE"). Empty/absent
    // for games nobody has verified real noise patterns for yet.
    const noisePatterns = srv.logNoisePatterns || [];

    // Shared by the backfill read (existing file content, on watcher attach)
    // and the live poll below, so both paths clean/format identically.
    const cleanAndFormat = (incomingText) => {
        const rawLines = incomingText.split(/\r?\n/);
        const cleanLines = rawLines.filter(line => {
            const low = line.toLowerCase();
            const isSpam = noisePatterns.some(pattern => low.includes(pattern));
            return line.trim() !== '' && !isSpam;
        });
        DebugConsoleLogs(`[RSM-DEBUG] Lines processed: ${rawLines.length} | Lines kept: ${cleanLines.length}`);
        return cleanLines.map(line => line.replace(/Thread:\s+\d+\s+->\s+/, '| ')).join('\n');
    };

    const readChunk = (filePath, start, length) => {
        const buffer = Buffer.alloc(length);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, length, start);
        fs.closeSync(fd);
        return buffer.toString(selectedEncoding).replace(/\0/g, '');
    };

    DebugConsoleLogs(`[RSM-DEBUG] Initializing Log Watcher`);
    DebugConsoleLogs(`[RSM-DEBUG] Target: ${srv.name} | Type: ${srv.type} | Encoding: ${selectedEncoding}`);

    try {
        const getNewestLog = () => {
            if (!fs.existsSync(logFolderPath)) return null;
            const files = fs.readdirSync(logFolderPath)
                .filter(fileName => fileName.endsWith('.log'))
                .map(fileName => ({
                    name: fileName,
                    time: fs.statSync(path.join(logFolderPath, fileName)).mtime.getTime()
                }))
                .sort((firstFile, secondFile) => secondFile.time - firstFile.time);
            return files.length > 0 ? path.join(logFolderPath, files[0].name) : null;
        };

        const newestLog = getNewestLog();
        if (!newestLog) {
            // Not reported to the system console here -- this function is
            // called repeatedly by the startup poller below while waiting for
            // the server to write its first log file, so "not found yet" is
            // the expected, common case rather than a failure. The poller
            // reports once if it gives up entirely.
            DebugConsoleLogs(`Cancelled: No .log files found in ${logFolderPath}`);
            return null;
        }

        DebugLog(`Tailing: ${path.basename(newestLog)}`);
        srv._loggedWatcherError = false;
        const startedMsg = `[RSM] "${srv.name}" -- console readout started, tailing ${path.basename(newestLog)}`;
        console.log(startedMsg);
        if (event) event.reply('system-info', startedMsg);

        const totalSize = fs.statSync(newestLog).size;
        let lastSize = totalSize;

        // Backfill whatever's already in the file before switching to live
        // tailing -- otherwise the console looks blank any time the watcher
        // attaches after the server has already logged its startup sequence
        // (Space Engineers writes its whole boot burst in the first couple
        // seconds, well before RSM finishes launching and attaching here).
        // Capped to BACKFILL_CAP trailing bytes -- the renderer only retains
        // the last 50,000 chars of srv.logs anyway, so reading further back
        // would just get trimmed immediately.
        if (totalSize > 0) {
            try {
                const BACKFILL_CAP = 50000;
                let backfillStart = Math.max(0, totalSize - BACKFILL_CAP);
                // UTF-16LE is 2 bytes/char -- an odd start offset would split
                // a character pair and garble the first decoded character.
                if (selectedEncoding === 'utf16le' && backfillStart % 2 !== 0) backfillStart -= 1;

                const formatted = cleanAndFormat(readChunk(newestLog, backfillStart, totalSize - backfillStart));
                if (formatted.trim()) {
                    const header = backfillStart > 0 ? '--- Existing log content (tail) ---' : '--- Existing log content ---';
                    sendConsoleOut(event, srv.id, `[RSM] ${header}\n${formatted}\n[RSM] --- Live output ---\n`);
                }
            } catch (error) {
                DebugLog(`Backfill read failed for ${srv.name}: ${error.message}`);
            }
        }

        return setInterval(() => {
            try {
                const stats = fs.statSync(newestLog);
                // File was recreated/truncated (new server run) — reset position
                if (stats.size < lastSize) lastSize = 0;
                if (stats.size > lastSize) {
                    const bufferSize = stats.size - lastSize;
                    const incomingText = readChunk(newestLog, lastSize, bufferSize);
                    lastSize = stats.size;

                    if (DebugLogging) {
                        console.log(`[RSM-DEBUG] Captured ${bufferSize} bytes from ${srv.name}`);
                        console.log(`[RSM-DEBUG] Raw Preview: ${incomingText.substring(0, 50).replace(/\n/g, '\\n')}...`);
                    }

                    const formattedOutput = cleanAndFormat(incomingText);
                    if (formattedOutput.trim()) {
                        sendConsoleOut(event, srv.id, formattedOutput + '\n');
                    }
                }
            } catch (error) {
                if (DebugActive && error.code !== 'EBUSY') {
                    console.log(`[RSM-DEBUG] Loop Error for ${srv.name}: ${error.message}`);
                }
            }
        }, 1000);
    } catch (err) {
        // The startup poller below calls this every 2s while waiting for a
        // log file -- report a persistent error once, not on every retry.
        if (!srv._loggedWatcherError) {
            srv._loggedWatcherError = true;
            const msg = `[RSM-ERROR] "${srv.name}" -- console readout failed to start: ${err.message}`;
            console.error(msg);
            if (event) event.reply('system-info', msg);
        }
    }
};

// --- COMMAND INJECTION LOGIC ---
// DIRECT_CONSOLE servers take commands on stdin; everything else is reached over
// the network (RCON, WebRCON, ...) through server-protocols.js -- the same code
// the REST API uses. Network commands do not need RSM to own the process's
// stdin, so they also work for servers re-linked after an RSM restart.
ipcMain.on('send-command', async (event, { srvId, command } = {}) => {
    console.log(`[RSM] send-command -- srvId: ${srvId} | command: "${command}"`);
    const processInfo = activeProcesses[srvId];
    const srv = managedServers.find(managedServer => managedServer.id === srvId);
    if (!processInfo || !srv) {
        event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] Server is not active. Cannot send command.\n` });
        return;
    }

    const cleanCommand = String(command || '').trim();
    if (!cleanCommand) return;

    if (findServType(srv) === 'DIRECT_CONSOLE') {
        const consoleInput = processInfo.shell && processInfo.shell.stdin;
        if (consoleInput && consoleInput.writable) {
            try {
                consoleInput.write(cleanCommand + '\n');
                sendConsoleOut(event, srvId, `> ${cleanCommand}\n`);
            } catch (error) {
                sendConsoleOut(event, srvId, `[RSM-ERROR] Failed to write to console: ${error.message}\n`);
            }
        } else {
            sendConsoleOut(event, srvId, `[RSM-ERROR] Console input is not available (a server re-linked after an RSM restart has no stdin -- restart it from RSM).\n`);
        }
        return;
    }

    try {
        const reply = await serverProtocols.sendNetworkCommand(srv, cleanCommand);
        sendConsoleOut(event, srvId, `> ${cleanCommand}\n${reply ? reply + '\n' : ''}`);
    } catch (error) {
        sendConsoleOut(event, srvId, `[RSM-ERROR] Command failed: ${error.message}\n`);
    }
});

// --- PLAYER COUNT & SESSION INFO ---
// Minecraft, 7 Days to Die and Terraria answer on stdin: the reply arrives as an
// ordinary console-out line and is parsed in the renderer (each game words it
// differently). Project Zomboid is also DIRECT_CONSOLE but has genuine RCON and
// is handled by the network path below. Everything else is asked over the
// network by server-protocols.js, which the REST API shares.
const STDIN_PLAYER_COUNT_GAMES = new Set(['minecraft', '7-days-to-die', 'terraria']);

ipcMain.on('get-player-count', async (event, srvId) => {
    const srv = managedServers.find(managedServer => managedServer.id === srvId);
    const processInfo = activeProcesses[srvId];
    if (!srv || !processInfo) return;

    const gameType = String(srv.type || '').toLowerCase();
    DebugConsoleLogs(`[RSM] get-player-count -- srvId: ${srvId} | type: ${gameType}`);

    if (STDIN_PLAYER_COUNT_GAMES.has(gameType)) {
        const consoleInput = processInfo.shell && processInfo.shell.stdin;
        if (consoleInput && consoleInput.writable) consoleInput.write((srv.playerListCommand || 'list') + '\n');
        return;
    }

    let playersLabel = null;
    let worldName = null;
    try {
        const playerCount = await serverProtocols.queryPlayerCount(srv);
        if (playerCount && playerCount.online !== null) {
            playersLabel = playerCount.max !== null ? `${playerCount.online} / ${playerCount.max}` : `${playerCount.online} connected`;
            worldName = playerCount.world || null;
        }
    } catch (error) {
        // Polled every few seconds -- an unreachable server is normal while it boots, so stay quiet.
        DebugConsoleLogs(`[RSM] get-player-count -- ${srv.name}: ${error.message}`);
    }
    event.reply('player-count-update', { id: srvId, players: playersLabel, world: worldName });
});


//      _____ ___  _     ____  _____ ____    _   _    _    _   _ ____  _     ___ _   _  ____
//     |  ___/ _ \| |   |  _ \| ____|  _ \  | | | |  / \  | \ | |  _ \| |   |_ _| \ | |/ ___|
//     | |_ | | | | |   | | | |  _| | |_) | | |_| | / _ \ |  \| | | | | |    | ||  \| | |  _
//     |  _|| |_| | |___| |_| | |___|  _ <  |  _  |/ ___ \| |\  | |_| | |___ | || |\  | |_| |
//     |_|   \___/|_____|____/|_____|_| \_\ |_| |_/_/   \_\_| \_|____/|_____|___|_| \_|\____|
//

// --- OPENING FILE DIALOGS ---
ipcMain.handle('open-dialog', async () => {
    console.log('[RSM] open-dialog -- showing file picker');
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Game Servers', extensions: ['exe', 'bat', 'cmd', 'jar', 'ps1', 'ps', 'sh'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    const selected = result.canceled ? null : result.filePaths[0];
    console.log(`[RSM] open-dialog -- result: ${selected || 'cancelled'}`);
    return selected;
});

// --- OPENING FOLDER DIALOGS ---
ipcMain.handle('select-folder', async () => {
    console.log('[RSM] select-folder -- showing folder picker');
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    const selected = result.canceled ? null : result.filePaths[0];
    // The user just chose this folder in a native dialog the renderer cannot
    // forge, so it is safe to let config files / backups live there.
    if (selected) configFileGuard.trustDirectory(selected);
    console.log(`[RSM] select-folder -- result: ${selected || 'cancelled'}`);
    return selected;
});

// --- CONFIG FILE READ/WRITE ---
ipcMain.handle('get-desktop-path', () => app.getPath('desktop'));

// --- FIREWALL RULE MANAGEMENT (Portier integration) ---
// All logic lives in firewall-service.js (validated inputs, escaped scripts,
// rules scoped to RSM's own group) and is shared with the REST API and the
// Citadel relay. These handlers only adapt the IPC argument shapes.
ipcMain.handle('check-firewall-rules', async (event, { serverName } = {}) => {
    console.log(`[RSM] check-firewall-rules -- serverName: "${serverName}"`);
    const hasRules = await firewallService.serverHasRules(serverName);
    console.log(`[RSM] check-firewall-rules -- result: ${hasRules}`);
    return hasRules;
});

ipcMain.handle('apply-firewall-rules', async (event, { serverName, ports } = {}) => {
    console.log(`[RSM] apply-firewall-rules -- serverName: "${serverName}" | ports: ${ports?.length || 0}`);
    const outcome = await firewallService.applyServerRules(serverName, ports);
    console.log(`[RSM] apply-firewall-rules -- success: ${outcome.success}${outcome.error ? ' | error: ' + outcome.error : ''}`);
    return outcome;
});

ipcMain.handle('remove-firewall-rules', async (event, { serverName } = {}) => {
    console.log(`[RSM] remove-firewall-rules -- serverName: "${serverName}"`);
    const outcome = await firewallService.removeServerRules(serverName);
    console.log(`[RSM] remove-firewall-rules -- success: ${outcome.success}${outcome.error ? ' | error: ' + outcome.error : ''}`);
    return outcome;
});

// --- PORTIER MANAGEMENT VIEW ---
ipcMain.handle('get-firewall-rules', async () => {
    console.log('[RSM] get-firewall-rules -- fetching all Portier managed rules');
    const rules = await firewallService.listManagedRules();
    console.log(`[RSM] get-firewall-rules -- returned ${rules.length} rule(s)`);
    return rules;
});

ipcMain.handle('add-firewall-rule', async (event, { displayName, port, tcp, udp } = {}) => {
    console.log(`[RSM] add-firewall-rule -- displayName: "${displayName}" | port: ${port} | tcp: ${tcp} | udp: ${udp}`);
    const outcome = await firewallService.addRule({ displayName, port, tcp, udp });
    console.log(`[RSM] add-firewall-rule -- success: ${outcome.success}${outcome.error ? ' | error: ' + outcome.error : ''}`);
    return outcome;
});

ipcMain.handle('check-port-conflicts', async (event, { ports, excludeServerName } = {}) => {
    console.log(`[RSM] check-port-conflicts -- ports: ${JSON.stringify(ports)} | exclude: ${excludeServerName || 'none'}`);
    const conflicts = await firewallService.findPortConflicts(ports, excludeServerName);
    console.log(`[RSM] check-port-conflicts -- found ${conflicts.length} conflict(s)`);
    return conflicts;
});

ipcMain.handle('remove-firewall-rule', async (event, { displayName } = {}) => {
    console.log(`[RSM] remove-firewall-rule -- displayName: "${displayName}"`);
    const outcome = await firewallService.removeRule(displayName);
    console.log(`[RSM] remove-firewall-rule -- success: ${outcome.success}${outcome.error ? ' | error: ' + outcome.error : ''}`);
    return outcome;
});

ipcMain.handle('toggle-firewall-rule', async (event, { displayName, enabled } = {}) => {
    console.log(`[RSM] toggle-firewall-rule -- displayName: "${displayName}" | enabled: ${enabled}`);
    const outcome = await firewallService.setRuleEnabled(displayName, !!enabled);
    console.log(`[RSM] toggle-firewall-rule -- success: ${outcome.success}${outcome.error ? ' | error: ' + outcome.error : ''}`);
    return outcome;
});

// Shared by the renderer (IPC), the REST API and the Citadel relay. Every path
// is vetted by configFileGuard first -- see config-file-guard.js for the rules.
const MAXIMUM_CONFIG_FILE_BYTES = 5 * 1024 * 1024;

function readConfigFileSafely(filePath) {
    try {
        const authorizedPath = configFileGuard.authorizeConfigFile(filePath);
        if (fs.statSync(authorizedPath).size > MAXIMUM_CONFIG_FILE_BYTES) {
            throw new Error('File is too large to edit (limit 5 MB).');
        }
        return { success: true, content: fs.readFileSync(authorizedPath, 'utf8') };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function writeConfigFileSafely({ filePath, content, backupDir, serverType, serverName }) {
    let backedUp = false;
    let backupError = null;
    try {
        const authorizedPath = configFileGuard.authorizeConfigFile(filePath);
        if (typeof content !== 'string') throw new Error('content must be a string.');
        if (Buffer.byteLength(content, 'utf8') > MAXIMUM_CONFIG_FILE_BYTES) {
            throw new Error('Content is too large (limit 5 MB).');
        }

        if (backupDir && serverName) {
            // A failed backup is reported but does not block the save.
            try {
                const serverBackupDir = configFileGuard.authorizeBackupFolder(backupDir, serverType, serverName);
                fs.mkdirSync(serverBackupDir, { recursive: true });
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const backupPath = path.join(serverBackupDir, `${path.basename(authorizedPath)}-${timestamp}.bak`);
                fs.writeFileSync(backupPath, fs.readFileSync(authorizedPath, 'utf8'), 'utf8');
                backedUp = true;
            } catch (backupFailure) {
                backupError = backupFailure.message;
            }
        }
        fs.writeFileSync(authorizedPath, content, 'utf8');
        return { success: true, backedUp, backupError };
    } catch (error) {
        return { success: false, backedUp, backupError, error: error.message };
    }
}

function listBackupFilesSafely({ backupDir, serverType, serverName, fileName }) {
    try {
        if (typeof fileName !== 'string' || fileName === '' || path.basename(fileName) !== fileName) {
            throw new Error('fileName must be a plain file name.');
        }
        const serverBackupDir = configFileGuard.authorizeBackupFolder(backupDir, serverType, serverName);
        if (!fs.existsSync(serverBackupDir)) return { success: true, backups: [] };
        const backups = fs.readdirSync(serverBackupDir)
            .filter(entryName => entryName.startsWith(fileName + '-') && entryName.endsWith('.bak'))
            .map(entryName => ({ name: entryName, path: path.join(serverBackupDir, entryName), modifiedMilliseconds: fs.statSync(path.join(serverBackupDir, entryName)).mtimeMs }))
            .sort((firstBackup, secondBackup) => secondBackup.modifiedMilliseconds - firstBackup.modifiedMilliseconds)
            .map(({ name, path: backupPath }) => ({ name, path: backupPath }));
        return { success: true, backups };
    } catch (error) {
        return { success: false, error: error.message, backups: [] };
    }
}

ipcMain.handle('read-config-file', (event, filePath) => {
    console.log(`[RSM] read-config-file -- filePath: "${filePath}"`);
    const outcome = readConfigFileSafely(filePath);
    console.log(outcome.success ? `[RSM] read-config-file -- success, ${outcome.content.length} chars` : `[RSM] read-config-file -- failed: ${outcome.error}`);
    return outcome;
});

ipcMain.handle('write-config-file', (event, request = {}) => {
    console.log(`[RSM] write-config-file -- filePath: "${request.filePath}" | backupDir: ${request.backupDir || 'none'}`);
    const outcome = writeConfigFileSafely(request);
    console.log(outcome.success ? `[RSM] write-config-file -- success | backedUp: ${outcome.backedUp}` : `[RSM] write-config-file -- failed: ${outcome.error}`);
    return outcome;
});

ipcMain.handle('list-backups', (event, request = {}) => {
    console.log(`[RSM] list-backups -- ${request.serverType}/${request.serverName} | file: ${request.fileName}`);
    const outcome = listBackupFilesSafely(request);
    console.log(outcome.success ? `[RSM] list-backups -- found ${outcome.backups.length} backup(s)` : `[RSM] list-backups -- error: ${outcome.error}`);
    return outcome;
});

// --- OPEN DOCS IN BROWSER ---
ipcMain.on('open-docs', () => {
    console.log('[RSM] open-docs -- opening documentation in browser');
    shell.openExternal('https://phonicspider.github.io/Ronin-Server-Manager/');
});

// --- WINDOW OPACITY ---
ipcMain.on('update-window-opacity', (event, value) => {
    console.log(`[RSM] update-window-opacity -- setting to ${parseFloat(value).toFixed(2)}`);
    mainWindow.setOpacity(parseFloat(value));
});

// --- CUSTOM TITLEBAR CONTROLS (frameless window) ---
ipcMain.on('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.on('window-maximize-toggle', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
});

// Actually quits -- distinct from window-hide-to-tray, which keeps RSM running.
ipcMain.on('window-close', () => {
    app.isQuiting = true;
    app.quit();
});

// Keeps RSM running in the background, same as the pre-existing default close
// behavior. A separate action from window-close now that Close actually quits.
ipcMain.on('window-hide-to-tray', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
});

// --- APP UPDATER ---
function _sendUpdateStatus(status, extra = {}) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', { status, ...extra });
    }
}

autoUpdater.on('checking-for-update', () => {
    console.log('[RSM] Checking for updates...');
    _sendUpdateStatus('checking');
});
autoUpdater.on('update-available', (info) => {
    console.log(`[RSM] Update available: v${info.version}`);
    _sendUpdateStatus('available', { version: info.version });
});
autoUpdater.on('update-not-available', () => {
    console.log('[RSM] No update available -- running the latest version.');
    _sendUpdateStatus('not-available');
});
autoUpdater.on('error', (err) => {
    console.error('[RSM] Update check failed:', err.message);
    _sendUpdateStatus('error', { message: err.message });
});
autoUpdater.on('download-progress', (progress) => {
    _sendUpdateStatus('downloading', { percent: Math.round(progress.percent) });
});
autoUpdater.on('update-downloaded', (info) => {
    console.log(`[RSM] Update downloaded: v${info.version}`);
    _sendUpdateStatus('downloaded', { version: info.version });
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('check-for-updates', async () => {
    try {
        const result = await autoUpdater.checkForUpdates();
        return { success: true, version: result?.updateInfo?.version || null };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.on('download-update', () => {
    autoUpdater.downloadUpdate().catch(error => {
        console.error('[RSM] Update download failed:', error.message);
        _sendUpdateStatus('error', { message: error.message });
    });
});

ipcMain.on('install-update', () => {
    app.isQuiting = true;
    autoUpdater.quitAndInstall();
});

// --- OPEN FOLDER IN EXPLORER ---
ipcMain.on('open-folder', (event, rawData) => {
    console.log('[RSM] open-folder -- requested for:', typeof rawData === 'string' ? rawData : JSON.stringify(rawData));
    let targetPath = (typeof rawData === 'object') ? (rawData.workingDir || rawData.exePath || rawData.path) : rawData;

    if (!targetPath) return;
    targetPath = path.resolve(targetPath.replace(/["]+/g, '').trim());

    if (fs.existsSync(targetPath)) {
        const isFile = fs.lstatSync(targetPath).isFile();
        const args = isFile ? ['/select,', targetPath] : [targetPath];

        spawn('explorer.exe', args, {
            detached: true,
            stdio: 'ignore'
        }).unref();

        event.reply('system-info', `[RSM] Explorer opened at: ${targetPath}`);
    } else {
        event.reply('system-error', `Path not found: ${targetPath}`);
    }
});

// --- OPENING SERVER GUI (e.g. Space Engineers dedicated server GUI) ---
ipcMain.on('show-server-gui', (event, srv) => {
    console.log(`[RSM] show-server-gui -- path: ${typeof srv === 'object' ? srv.path : srv}`);
    let exePath = '';
    let instancePath = '';

    if (srv && typeof srv === 'object') {
        exePath = srv.path;
        instancePath = srv.logPath;
    } else {
        exePath = srv;
    }

    if (!exePath || typeof exePath !== 'string') {
        console.error(`[RSM] Cannot open GUI: Invalid path received.`);
        return;
    }

    const exeName = path.basename(exePath);
    const isSpaceEngineers = exeName.toLowerCase().includes('spaceengineers');
    // Spawned directly with an argument array -- the old version built a
    // `start "" "exe" -path "dir"` string for cmd.exe, so a quote in either path
    // ended the quoting and ran the rest as commands.
    const launchArguments = (instancePath && isSpaceEngineers) ? ['-path', instancePath] : [];

    try {
        const guiProcess = spawn(exePath, launchArguments, { cwd: path.dirname(exePath), detached: true, stdio: 'ignore' });
        guiProcess.on('error', (error) => {
            console.error(`[RSM] Failed to launch GUI: ${error}`);
            event.reply('system-info', `[RSM] Error launching GUI: ${error.message}`);
        });
        guiProcess.unref();
        event.reply('system-info', `[RSM] Opening GUI for ${exeName}...`);
    } catch (error) {
        console.error(`[RSM] Failed to launch GUI: ${error}`);
        event.reply('system-info', `[RSM] Error launching GUI: ${error.message}`);
    }
});


//      ____  _____ ____  __     _______ ____      _    ____  _     _____
//     |  _ \| ____/ ___|\ \   / / ____|  _ \    / \  |  _ \| |   | ____|
//     | | | |  _| \___ \ \ \ / /|  _| | |_) |  / _ \ | |_) | |   |  _|
//     | |_| | |___ ___) | \ V / | |___|  _ <  / ___ \|  _ <| |___| |___
//     |____/|_____|____/   \_/  |_____|_| \_\/_/   \_\_| \_\_____|_____|
//
//  SteamCMD inlined -- no external module needed.
//  Covers every game in the catalog (anonymous installs only).
//  Authenticated installs are a future addition.
// ─────────────────────────────────────────────────────────────────────────────

const https         = require('https');

const STEAMCMD_ZIP_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
const STEAMCMD_MAXIMUM_REDIRECTS = 5;

// Downloads over HTTPS only. Redirects are followed (a few, to https targets)
// so a redirect loop or a downgrade to plain http cannot be used to hang or
// intercept the install.
function steamcmdDownload (url, destination, remainingRedirects = STEAMCMD_MAXIMUM_REDIRECTS) {
    return new Promise((resolve, reject) => {
        if (!url.startsWith('https://')) {
            reject(new Error(`Refusing to download SteamCMD over an insecure URL: ${url}`));
            return;
        }
        const outputFile = fs.createWriteStream(destination);
        const abandon = (error) => { outputFile.destroy(); fs.unlink(destination, () => {}); reject(error); };

        const request = https.get(url, response => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                outputFile.destroy();
                fs.unlink(destination, () => {});
                if (remainingRedirects <= 0) { reject(new Error('Too many redirects while downloading SteamCMD.')); return; }
                const redirectUrl = new URL(response.headers.location, url).toString();
                steamcmdDownload(redirectUrl, destination, remainingRedirects - 1).then(resolve, reject);
                return;
            }
            if (response.statusCode !== 200) {
                response.resume();
                abandon(new Error(`Download failed: HTTP ${response.statusCode}`));
                return;
            }
            response.pipe(outputFile);
            outputFile.on('finish', () => outputFile.close(resolve));
            outputFile.on('error', abandon);
        });
        request.setTimeout(60_000, () => request.destroy(new Error('SteamCMD download timed out.')));
        request.on('error', abandon);
    });
}

async function steamcmdEnsure (steamcmdDir) {
    const exePath = path.join(steamcmdDir, 'steamcmd.exe');
    if (fs.existsSync(exePath)) return { exePath, alreadyInstalled: true };
    fs.mkdirSync(steamcmdDir, { recursive: true });
    const zipPath = path.join(steamcmdDir, 'steamcmd.zip');
    await steamcmdDownload(STEAMCMD_ZIP_URL, zipPath);

    // Windows' own Expand-Archive replaces the extract-zip package, which has
    // unfixed advisories about archive entries writing outside the target folder.
    const extraction = await runPowerShellScript(
        `Expand-Archive -LiteralPath '${escapePowerShellLiteral(zipPath)}' -DestinationPath '${escapePowerShellLiteral(steamcmdDir)}' -Force`
    );
    if (extraction.error) throw new Error(`Could not extract SteamCMD: ${extraction.stderr.trim() || extraction.error.message}`);

    fs.unlinkSync(zipPath);
    if (!fs.existsSync(exePath)) throw new Error('SteamCMD zip extracted but steamcmd.exe is missing.');
    return { exePath, alreadyInstalled: false };
}

function steamcmdBufferLines (stream, onLine) {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n')) !== -1) {
            const line = buf.slice(0, idx).replace(/\r$/, '');
            buf = buf.slice(idx + 1);
            if (line.length) onLine(line);
        }
    });
    stream.on('end', () => { if (buf.length) onLine(buf); });
}

function steamcmdInstallApp ({ exePath, appId, installDir, onLog = () => {}, onProgress = () => {}, extraArgs = [] }) {
    if (!fs.existsSync(exePath)) return Promise.reject(new Error(`steamcmd.exe not found at ${exePath}`));
    fs.mkdirSync(installDir, { recursive: true });
    const args = ['+force_install_dir', installDir, '+login', 'anonymous', '+app_update', String(appId), 'validate', ...extraArgs, '+quit'];
    onLog(`[steamcmd] ${exePath} ${args.join(' ')}`);

    function attempt () {
        return new Promise((resolve, reject) => {
            const child = spawn(exePath, args, { windowsHide: true });
            let sawSelfUpdate = false;
            const handleLine = line => {
                onLog(line);
                if (/Update complete, launching|Installing update|Extracting package/.test(line)) sawSelfUpdate = true;
                const progressMatch = line.match(/progress:\s+([\d.]+)\s+\((\d+)\s+\/\s+(\d+)\)/i);
                if (progressMatch) onProgress({ percent: parseFloat(progressMatch[1]), downloadedBytes: parseInt(progressMatch[2], 10), totalBytes: parseInt(progressMatch[3], 10) });
            };
            steamcmdBufferLines(child.stdout, handleLine);
            steamcmdBufferLines(child.stderr, handleLine);
            child.on('error', reject);
            child.on('close', code => resolve({ code, sawSelfUpdate }));
        });
    }

    return attempt().then(({ code, sawSelfUpdate }) => {
        if (code === 0) return { code };
        if (code === 7 && sawSelfUpdate) {
            onLog('[steamcmd] Self-update completed (exit 7) -- re-running to perform the install...');
            return attempt().then(({ code: code2 }) => {
                if (code2 === 0) return { code: code2 };
                throw new Error(`SteamCMD exited ${code2} after self-update retry.`);
            });
        }
        throw new Error(`SteamCMD exited with code ${code}`);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared helper: load the registry via dynamic import (ES module)
// ─────────────────────────────────────────────────────────────────────────────

async function loadRegistry () {
    const mod = await import('./public/configs/index.js');
    return mod.ServerTypeRegistry;
}

function readConfigFiles (game, installDir) {
    const configDir = (game.gameFiles && game.gameFiles.configPath)
        ? path.join(installDir, game.gameFiles.configPath)
        : installDir;
    const fileContentsMap = {};
    const configFiles     = [];
    for (const cf of (game.gameFiles && game.gameFiles.configs) || []) {
        const fullPath = path.join(configDir, cf.file);
        const content  = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
        fileContentsMap[cf.file] = content;
        configFiles.push({ label: cf.label, filePath: fullPath, content });
    }
    return { fileContentsMap, configFiles };
}

// ─────────────────────────────────────────────────────────────────────────────
//  IPC: INSTALL INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

// --- LIST INSTALLABLE GAMES ---
ipcMain.handle('forge:get-games', async (event, { mode } = {}) => {
    const registry = await loadRegistry();
    return Object.entries(registry)
        .filter(([, game]) => mode === 'install' ? (game.forge && game.forge.appId) : !!game.forge)
        .map(([slug, game]) => ({
            slug,
            displayName: game.meta.displayName,
            icon:        game.meta.icon,
            forge:       game.forge || null,
        }));
});

// --- GET DEFAULT INSTALL ROOT ---
ipcMain.handle('forge:get-install-root', () => {
    return path.join(app.getPath('desktop'), 'RSM-Files', 'Servers');
});

// --- INSTALL SERVER (streams forge:log / forge:phase / forge:progress) ---
ipcMain.handle('forge:install', async (event, { gameSlug, serverName, installRoot }) => {
    console.log(`[RSM] forge:install -- game: ${gameSlug} | name: "${serverName}" | root: ${installRoot}`);

    const desktop     = app.getPath('desktop');
    const steamcmdDir = path.join(desktop, 'RSM-Files', 'SteamCMD');
    const root        = installRoot || path.join(desktop, 'RSM-Files', 'Servers');
    // serverName is free text from the renderer: strip path separators and
    // other characters that could climb out of (or break) the install root.
    const installFolderName = String(serverName || '').replace(/\s+/g, '-').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-').replace(/^\.+/, '').slice(0, 100) || 'server';
    const installDir  = path.join(root, installFolderName);

    const send = (ch, data) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, data); };

    try {
        const registry = await loadRegistry();
        const game     = registry[gameSlug];
        if (!game) throw new Error(`Unknown game slug: ${gameSlug}`);
        if (!game.forge || !game.forge.appId) throw new Error(`${game.meta.displayName} does not support auto-install.`);

        send('forge:phase', 'validate');
        if (fs.existsSync(installDir) && fs.readdirSync(installDir).length > 0) {
            throw new Error(`Install folder already exists and is not empty: ${installDir}`);
        }
        configFileGuard.trustDirectory(installDir);
        send('forge:log', `[RSM] Installing ${game.meta.displayName} to ${installDir}`);

        send('forge:phase', 'install');
        const sc = await steamcmdEnsure(steamcmdDir);
        send('forge:log', sc.alreadyInstalled
            ? `[steamcmd] Using existing install at ${sc.exePath}`
            : `[steamcmd] Bootstrapped SteamCMD at ${sc.exePath}`);

        await steamcmdInstallApp({
            exePath:    sc.exePath,
            appId:      game.forge.appId,
            installDir,
            onLog:      line => send('forge:log',      line),
            onProgress: prog => send('forge:progress', prog),
        });

        send('forge:phase', 'done');
        send('forge:log', `[RSM] Install complete.`);
        console.log(`[RSM] forge:install -- done, installDir: ${installDir}`);
        return { success: true, installDir };

    } catch (err) {
        console.error(`[RSM] forge:install -- failed: ${err.message}`);
        send('forge:log', `[ERROR] ${err.message}`);
        return { success: false, error: err.message };
    }
});

// --- PARSE CONFIG FILES (called before step 4) ---
ipcMain.handle('forge:parse-config', async (event, { gameSlug, installDir }) => {
    console.log(`[RSM] forge:parse-config -- game: ${gameSlug} | dir: ${installDir}`);
    try {
        const registry = await loadRegistry();
        const game     = registry[gameSlug];
        if (!game) throw new Error(`Unknown game: ${gameSlug}`);

        const { fileContentsMap, configFiles } = readConfigFiles(game, installDir);

        const exePath = (game.forge && game.forge.relExe)
            ? path.join(installDir, game.forge.relExe)
            : null;

        let parsed = {};
        if (typeof game.parseForRsm === 'function') {
            try { parsed = game.parseForRsm(fileContentsMap, { installDir, exePath }); }
            catch (error) { console.error(`[RSM] parseForRsm error for ${gameSlug}: ${error.message}`); }
        }

        return {
            success: true,
            configFiles,
            parsed,
            defaults: {
                args:          game.defaults && game.defaults.customArgs || '',
                firewallPorts: game.firewallPorts || [],
            },
        };
    } catch (err) {
        console.error(`[RSM] forge:parse-config -- error: ${err.message}`);
        return { success: false, error: err.message };
    }
});

// --- REGISTER SERVER (step 4 "Add to RSM") ---
ipcMain.handle('forge:register', async (event, { gameSlug, installDir, serverName, exePath, launchArgs, apiPort, apiPass, logPath, userFirewallPorts }) => {
    console.log(`[RSM] forge:register -- game: ${gameSlug} | name: "${serverName}" | dir: ${installDir}`);
    try {
        const registry = await loadRegistry();
        const game     = registry[gameSlug];
        if (!game) throw new Error(`Unknown game: ${gameSlug}`);

        const duplicate = managedServers.find(managedServer => managedServer.name === serverName && managedServer.type === gameSlug);
        if (duplicate) return { success: false, error: `A server named "${serverName}" (${gameSlug}) already exists in RSM.` };

        const { fileContentsMap } = readConfigFiles(game, installDir);
        const resolvedExe = exePath || ((game.forge && game.forge.relExe) ? path.join(installDir, game.forge.relExe) : '');

        let parsed = {};
        if (typeof game.parseForRsm === 'function') {
            try { parsed = game.parseForRsm(fileContentsMap, { installDir, exePath: resolvedExe }); }
            catch (error) { console.error(`[RSM] parseForRsm error: ${error.message}`); }
        }

        const entry = {
            id:                `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name:              serverName,
            type:              gameSlug,
            category:          (game.backend && game.backend.category) || 'POWERSHELL_BRIDGE',
            playerListCommand: (game.backend && game.backend.playerListCommand) || null,
            logNoisePatterns:  (game.backend && game.backend.logNoisePatterns) || [],
            path:              resolvedExe,
            workingDir:        installDir,
            args:              launchArgs !== undefined ? launchArgs : (parsed.args || (game.defaults && game.defaults.customArgs) || ''),
            // Step 4's Port/Password/Log Path fields (when the game's config
            // shows them via blocks.port/portPass/log) take priority over the
            // auto-parsed values -- the user may have corrected them.
            apiPort:           apiPort  || parsed.apiPort  || '',
            apiPass:           apiPass  || parsed.apiPass  || '',
            logPath:           logPath  || parsed.logPath  || '',
            firewallPorts:     userFirewallPorts || game.firewallPorts || [],
        };

        managedServers.push(entry);
        fs.writeFileSync(DATA_FILE, JSON.stringify(managedServers, null, 2));
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('servers-updated', managedServers);
        console.log(`[RSM] forge:register -- registered "${entry.name}" (id: ${entry.id})`);
        return { success: true, entry };

    } catch (err) {
        console.error(`[RSM] forge:register -- error: ${err.message}`);
        return { success: false, error: err.message };
    }
});


//      ____  _____ ____  _____ ___  ____  __  __    _    _   _  ____ _____
//     |  _ \| ____|  _ \|  ___/ _ \|  _ \|  \/  |  / \  | \ | |/ ___| ____|
//     | |_) |  _| | |_) | |_ | | | | |_) | |\/| | / _ \ |  \| | |   |  _|
//     |  __/| |___|  _ <|  _|| |_| |  _ <| |  | |/ ___ \| |\  | |___| |___
//     |_|   |_____|_| \_\_|   \___/|_| \_|_|  |_/_/   \_|_| \_|\____|_____|
//

setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        const entries = Object.values(serverStats);

        const cpuTotal = Math.min(
            entries.reduce((sum, statsEntry) => sum + (statsEntry.cpu || 0), 0),
            100
        );

        const totalSystemRamMB = Math.floor(os.totalmem() / 1024 / 1024);
        const serverRamMB = entries.reduce((sum, statsEntry) => sum + (statsEntry.ramMB || 0), 0);
        const ramTotal = Math.min(Math.round((serverRamMB / totalSystemRamMB) * 100), 100);

        mainWindow.webContents.send('total-performance-update', {
            cpu: cpuTotal,
            ram: ramTotal
        });
        DebugCpuRam(`Server Totals: CPU ${cpuTotal}% | RAM ${serverRamMB} MB (${ramTotal}%)`);

        si.networkStats().then(netStats => {
            if (!netStats || !netStats.length) return;
            // Sum all non-loopback interfaces for total machine throughput
            let rxSec = 0, txSec = 0;
            for (const iface of netStats) {
                if (iface.iface && iface.iface.toLowerCase().includes('loopback')) continue;
                rxSec += iface.rx_sec || 0;
                txSec += iface.tx_sec || 0;
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('network-stats-update', { rxSec, txSec });
            }
        }).catch((err) => {
            console.warn('[RSM] network-stats -- si.networkStats() failed:', err.message);
        });

        // Parse netstat once and emit per-server TCP connection counts
        const activeEntries = Object.entries(activeProcesses);
        if (activeEntries.length > 0) {
            execFile('netstat.exe', ['-ano'], { windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (nsErr, nsOut) => {
                if (nsErr) { console.warn('[RSM] netstat failed:', nsErr.message); return; }
                if (!nsOut || !mainWindow || mainWindow.isDestroyed()) return;
                const lines = nsOut.split('\n');
                for (const [srvId, info] of activeEntries) {
                    const pid = String(info.pid);
                    const count = lines.filter(line => {
                        const parts = line.trim().split(/\s+/);
                        return parts[3] === 'ESTABLISHED' && parts[4] === pid;
                    }).length;
                    mainWindow.webContents.send('server-connections-update', { id: srvId, connections: count });
                }
            });
        }
    }
}, 2000);


//      _   _ _____ _     ____  _____ ____  ____
//     | | | | ____| |   |  _ \| ____|  _ \/ ___|
//     | |_| |  _| | |   | |_) |  _| | |_) \___ \
//     |  _  | |___| |___|  __/| |___|  _ < ___) |
//     |_| |_|_____|_____|_|   |_____|_| \_\____/
//

// --- SERVER TYPE HELPER ---
// Determines how RSM interacts with a server process (direct stdin vs. PowerShell bridge).
function findServType(srv) {
    // srv.category is set directly from the game's own config (backend.category)
    // at save time -- see the Forge-install path and saveNewServer in
    // renderer.js. Trust it; it's always correct for whatever game the config
    // actually declares. Only guess from srv.type below for legacy server
    // entries saved before this field existed. This used to be a hardcoded
    // switch statement that silently defaulted 10 of 17 games to the wrong
    // category (anything not explicitly listed fell through to
    // DIRECT_CONSOLE, even for games whose config says POWERSHELL_BRIDGE) --
    // that broke log watching, RCON command dispatch, and player-count for
    // all of them at once.
    if (srv.category === 'DIRECT_CONSOLE' || srv.category === 'POWERSHELL_BRIDGE') {
        return srv.category;
    }

    const type = (srv.type || '').toLowerCase();
    DebugLog(`findServType -- no category on server, guessing from legacy type: '${type}'`);

    switch (type) {
        case 'minecraft':
        case '7-days-to-die':
        case 'terraria':
        case 'project-zomboid':
            return 'DIRECT_CONSOLE';
        default:
            return 'POWERSHELL_BRIDGE';
    }
}

// --- UNIVERSAL PROCESS SEARCH (finds the real game PID after PowerShell bridge launches it) ---
async function performSearch(bridgeProcessId, exeName, workingDir, finalizeCallback) {
    const searchExeName = exeName.toLowerCase();
    const searchDirectory = workingDir.toLowerCase().replace(/\\/g, '/');

    // PIDs already assigned to other servers -- never steal them for a second instance
    const claimedProcessIds = new Set(
        Object.values(activeProcesses).map(processInfo => processInfo.pid).filter(Boolean)
    );

    // Step 1: children of the PowerShell bridge whose image name is the game's.
    // Matched by image name rather than command line: Windows hides the command
    // line of processes running at a higher integrity level.
    const bridgeChildren = await listChildProcesses(bridgeProcessId);
    for (const childProcess of (bridgeChildren || [])) {
        if (childProcess.name.toLowerCase() !== searchExeName) continue;
        if (claimedProcessIds.has(childProcess.processId)) continue;
        DebugLog(`Deep Search: Found via Parent Link: ${childProcess.processId}`);
        finalizeCallback(childProcess.processId);
        return;
    }

    // Step 2: every process with this image name, matched by working directory in its
    // command line (games that relaunch themselves break the parent link).
    const sameImageProcesses = await listProcessesByImageName(exeName);
    if (!sameImageProcesses) return;

    DebugLog(`Performing instance search for EXE: '${searchExeName}' in DIR: '${searchDirectory}'`);
    for (const candidateProcess of sameImageProcesses) {
        if (candidateProcess.processId === bridgeProcessId || claimedProcessIds.has(candidateProcess.processId)) continue;

        const normalizedCommandLine = candidateProcess.commandLine.toLowerCase().replace(/\\/g, '/');
        if (normalizedCommandLine.includes(searchDirectory)) {
            DebugLog(`Deep Search: Found via Instance Match (EXE + dir): ${candidateProcess.processId}`);
            finalizeCallback(candidateProcess.processId);
            return;
        }
    }

    DebugLog(`Deep Search: No unclaimed instance found yet, will retry...`);
}

// --- DEBUG HELPERS ---
function DebugLog(message) {
    if (DebugActive) console.log(`${debugPrefix} ${message}`);
}

function DebugConsoleLogs(message) {
    if (DebugLogging) console.log(`${debugPrefix} ${message}`);
}

function DebugCpuRam(message) {
    if (DebugCPURAM) console.log(`${debugPrefix} ${message}`);
}


//      _    ____ ___   _   _ _____ _     ____  _____ ____  ____
//     / \  |  _ \_ _| | | | | ____| |   |  _ \| ____|  _ \/ ___|
//    / _ \ | |_) | |  | |_| |  _| | |   | |_) |  _| | |_) \___ \
//   / ___ \|  __/| |  |  _  | |___| |___|  __/| |___|  _ < ___) |
//  /_/   \_\_|  |___| |_| |_|_____|_____|_|   |_____|_| \_\____/
//
// These functions are injected into api-server.js via apiServer.init() at the
// top of this file.  They are function declarations so they are hoisted and
// visible at the call site even though they are defined here.

// ── Server CRUD ──────────────────────────────────────────────────────────────

function _apiAddServer(srv) {
    const { id: _id, pid, status, logs, ...safeProps } = srv;
    const newSrv = {
        ...safeProps,
        id:     crypto.randomBytes(8).toString('hex'),
        pid:    null,
        status: 'Offline',
        logs:   '',
    };
    managedServers.push(newSrv);
    fs.writeFileSync(DATA_FILE, JSON.stringify(managedServers, null, 2));
    return newSrv;
}

function _apiUpdateServer(id, updates) {
    const idx = managedServers.findIndex(managedServer => managedServer.id === id);
    if (idx === -1) return null;
    // Never let the API overwrite runtime-only fields
    const { id: _id, pid, status, logs, ...safeUpdates } = updates;
    managedServers[idx] = { ...managedServers[idx], ...safeUpdates };
    fs.writeFileSync(DATA_FILE, JSON.stringify(managedServers, null, 2));
    return managedServers[idx];
}

function _apiDeleteServer(id) {
    const idx = managedServers.findIndex(managedServer => managedServer.id === id);
    if (idx === -1) return false;
    managedServers.splice(idx, 1);
    fs.writeFileSync(DATA_FILE, JSON.stringify(managedServers, null, 2));
    return true;
}

// ── Firewall ─────────────────────────────────────────────────────────────────
// Thin adapters over firewall-service.js so the REST API and the Citadel relay
// run exactly the same validated code as the desktop UI.

function _apiGetFirewallRules() {
    return firewallService.listManagedRules();
}

function _apiAddFirewallRule(ruleRequest) {
    return firewallService.addRule(ruleRequest || {});
}

function _apiRemoveFirewallRule(displayName) {
    return firewallService.removeRule(displayName);
}

function _apiToggleFirewallRule(displayName, isEnabled) {
    return firewallService.setRuleEnabled(displayName, !!isEnabled);
}

// ── Config / backups ──────────────────────────────────────────────────────────
// Same guarded implementations as the desktop UI (see readConfigFileSafely above).

function _apiReadConfigFile(filePath) {
    return Promise.resolve(readConfigFileSafely(filePath));
}

function _apiWriteConfigFile(request) {
    return Promise.resolve(writeConfigFileSafely(request));
}

function _apiListBackups(request) {
    return Promise.resolve(listBackupFilesSafely(request));
}

// ── Forge proxy config ────────────────────────────────────────────────────────
// Reads forge-connection.json from RSM's userData directory.
// Schema: { "url": "http://127.0.0.1:3003", "apiKey": "<key>" }

function _apiGetForgeConfig() {
    try {
        const connectionFilePath = path.join(app.getPath('userData'), 'forge-connection.json');
        if (!fs.existsSync(connectionFilePath)) return null;
        return JSON.parse(fs.readFileSync(connectionFilePath, 'utf8'));
    } catch { return null; }
}

// ── Citadel agent config ──────────────────────────────────────────────────────

const CITADEL_CONFIG_FILE = path.join(app.getPath('userData'), 'citadel-agent.json');

function loadCitadelConfig() {
    if (fs.existsSync(CITADEL_CONFIG_FILE)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(CITADEL_CONFIG_FILE, 'utf8'));
            const storedToken = cfg.agentToken;
            cfg.agentToken = secretStore.reveal(storedToken);
            console.log('[RSM] loadCitadelConfig -- loaded:', { enabled: cfg.enabled, portalUrl: cfg.portalUrl });
            // Upgrade a plaintext token written by an older version.
            if (storedToken && !secretStore.isEncrypted(storedToken) && secretStore.isAvailable()) {
                try { saveCitadelConfig(cfg); } catch (error) { console.warn('[RSM] Could not encrypt citadel-agent.json:', error.message); }
            }
            return cfg;
        } catch (error) {
            console.error('[RSM] Failed to load citadel-agent.json:', error);
        }
    }
    return { enabled: false, portalUrl: '', agentToken: '', citadelApiUrl: '', orgSlug: '', machSlug: '' };
}

function saveCitadelConfig(config) {
    console.log('[RSM] saveCitadelConfig -- saving:', { enabled: config.enabled, portalUrl: config.portalUrl });
    fs.writeFileSync(CITADEL_CONFIG_FILE, JSON.stringify({ ...config, agentToken: secretStore.protect(config.agentToken) }, null, 2));
}

ipcMain.handle('get-citadel-config', () => loadCitadelConfig());

// Lets the renderer sync its badge/status-text to the agent's real current
// state on load, rather than relying solely on the 'citadel-status' push --
// the agent connects synchronously during app.whenReady(), which can (and
// often does) complete before the renderer's script has attached that
// listener, leaving the UI stuck showing its default disconnected state.
ipcMain.handle('get-citadel-status', () => roninAgent.getStatus());

ipcMain.on('save-citadel-config', (event, config) => {
    console.log(`[RSM] save-citadel-config -- enabled: ${config.enabled}`);
    saveCitadelConfig(config);
    if (config.enabled && config.portalUrl && config.agentToken && config.orgSlug && config.machSlug) {
        roninAgent.start(config.portalUrl, config.agentToken, config.citadelApiUrl, config.orgSlug, config.machSlug);
    } else {
        roninAgent.stop();
    }
});

// ── Citadel game-library (file repository) ─────────────────────────────────────
// These expose the published game-server build catalog to the renderer. If the
// portal is unreachable they resolve with { ok: false, error } so the UI can fall
// back to manual mode instead of throwing.

ipcMain.handle('citadel-game-library', async () => {
    try {
        const cfg = loadCitadelConfig();
        roninAgent.setApiBase(cfg.citadelApiUrl || cfg.portalUrl);
        const games = await roninAgent.fetchGameLibrary();
        return { ok: true, games };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('citadel-game-versions', async (_event, game) => {
    try {
        const cfg = loadCitadelConfig();
        roninAgent.setApiBase(cfg.citadelApiUrl || cfg.portalUrl);
        const versions = await roninAgent.fetchGameVersions(game);
        return { ok: true, versions };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('citadel-download-version', async (event, { game, versionId, destPath }) => {
    try {
        // destPath comes from the renderer; without this check a script there could
        // make the download overwrite any file RSM can write to.
        const authorizedDestination = configFileGuard.authorizeDownloadTarget(destPath);
        const cfg = loadCitadelConfig();
        roninAgent.setApiBase(cfg.citadelApiUrl || cfg.portalUrl);
        const result = await roninAgent.downloadGameVersion(game, versionId, authorizedDestination, (pct) => {
            if (!event.sender.isDestroyed()) event.sender.send('citadel-download-progress', { game, versionId, pct });
        });
        return { ok: true, ...result };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});
