const { app, BrowserWindow, shell, ipcMain, dialog, Tray, Menu, Notification } = require('electron');
const { Rcon } = require('rcon-client');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, exec, execSync } = require('child_process');
const si = require('systeminformation');
const os = require('os');
const { isNullOrUndefined } = require('util');
const axios = require('axios');
const apiServer = require('./api-server');

// Wire up api-server dependencies at module load time so they are always set
// before any HTTP request or IPC handler can reach the server.
// The closures capture module-level variables by reference — always current.
apiServer.init({
    getManagedServers:  () => managedServers,
    getActiveProcesses: () => activeProcesses,
    getServerStats:     () => serverStats,
    getMainWindow:      () => mainWindow,
    findServType,
    ipcMain
});

let mainWindow;
let tray = null;
const activeProcesses = {};
const serverStats = {}; // { [srvId]: { cpu, ramMB } } — updated each heartbeat tick
const DATA_FILE       = path.join(app.getPath('userData'), 'servers.json');
const API_CONFIG_FILE = path.join(app.getPath('userData'), 'api-config.json');
const TLS_CERT_FILE   = path.join(app.getPath('userData'), 'rsm-tls-cert.pem');
const TLS_KEY_FILE    = path.join(app.getPath('userData'), 'rsm-tls-key.pem');
const debugPrefix = "[RSM-DEBUG]";
const DebugActive = true;    // Set to true to enable verbose logging for debugging purposes
const DebugLogging = false;  // Set to true to enable debug logging for all operations
const DebugCPURAM = false;   // Set to true to enable detailed CPU/RAM logging in the perf loop

let managedServers = loadServers(); // hoisted from DATA section below

//      _    ____  ____    ___ _   _ ___ _____
//     / \  |  _ \|  _ \  |_ _| \ | |_ _|_   _|
//    / _ \ | |_) | |_) |  | ||  \| || |  | |
//   / ___ \|  __/|  __/   | || |\  || |  | |
//  /_/   \_\_|   |_|     |___|_| \_|___| |_|
//

// --- WINDOW CREATION & CONFIGURATION ---
function createWindow() {
    if (mainWindow) return;

    mainWindow = new BrowserWindow({
        width: 1250,
        height: 850,
        title: "Ronin Server Manager",
        icon: path.join(__dirname, 'icon.png'),
        backgroundColor: '#0f111a',
        hasShadow: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'public/index.html'));

    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

// --- SYSTEM TRAY CREATION & LOGIC ---
function createTray() {
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

    tray.on('click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });

    // Windows does not always show setContextMenu on right-click automatically
    tray.on('right-click', () => tray.popUpContextMenu(contextMenu));

    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });
}

// --- STARTUP SYNC AND PROCESS RE-LINKING ---
function syncActiveServers() {
    console.log("[RSM] Scanning for orphaned server processes...");

    exec('tasklist /v /fo csv', (err, stdout) => {
        if (err) return;

        const lines = stdout.split('\n');
        managedServers.forEach(srv => {
            const fileName = path.basename(srv.path).toLowerCase();
            const match = lines.find(line => line.toLowerCase().includes(fileName));

            if (match) {
                const parts = match.split('","');
                const pid = parseInt(parts[1]);

                console.log(`[RSM] Found existing process for ${srv.name} (PID: ${pid})`);
                activeProcesses[srv.id] = { pid: pid };

                if (mainWindow) {
                    mainWindow.webContents.send('status-change', {
                        id: srv.id,
                        status: 'Online',
                        pid: pid,
                        msg: "[RSM] Re-linked to existing process."
                    });
                }
            }
        });
    });

    console.log("[RSM] Startup scan complete.");
}

// --- APP LIFECYCLE EVENTS ---
app.whenReady().then(() => {
    createWindow();
    createTray();

    // Give the UI 3 seconds to load before reporting re-linked processes
    setTimeout(syncActiveServers, 3000);

    // Boot the REST API if the user has it enabled
    const apiCfg = loadApiConfig();
    if (apiCfg.enabled && apiCfg.apiKey) {
        const tls = ensureTlsCert();
        apiServer.start(apiCfg.port || 3002, apiCfg.apiKey, { key: tls.key, cert: tls.cert });
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => apiServer.stop());

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
    if (fs.existsSync(DATA_FILE)) {
        try {
            const servers = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            // Always start with every server Offline — syncActiveServers() will
            // re-link any that are genuinely still running after the app loads.
            return servers.map(s => ({ ...s, status: 'Offline', pid: null }));
        } catch (e) {
            console.error("[RSM] Failed to load servers.json:", e);
            return [];
        }
    }
    return [];
}

// --- API CONFIG LOAD / SAVE ---
function loadApiConfig() {
    if (fs.existsSync(API_CONFIG_FILE)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(API_CONFIG_FILE, 'utf8'));
            console.log('[RSM] loadApiConfig — loaded:', { enabled: cfg.enabled, port: cfg.port });
            return cfg;
        } catch (e) {
            console.error('[RSM] Failed to load api-config.json:', e);
        }
    }
    return { enabled: false, port: 3002, apiKey: '' };
}

function saveApiConfig(config) {
    console.log('[RSM] saveApiConfig — saving:', { enabled: config.enabled, port: config.port });
    fs.writeFileSync(API_CONFIG_FILE, JSON.stringify(config, null, 2));
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
    } catch (e) {
        console.warn('[RSM] Could not write rsm-api.json:', e.message);
    }
}

// Generates (or loads from cache) a self-signed TLS cert for the REST API.
// Returns { key, cert, fingerprint } — fingerprint is SHA-256 in AA:BB:CC format.
function ensureTlsCert() {
    if (fs.existsSync(TLS_CERT_FILE) && fs.existsSync(TLS_KEY_FILE)) {
        try {
            const cert = fs.readFileSync(TLS_CERT_FILE, 'utf8');
            const key  = fs.readFileSync(TLS_KEY_FILE,  'utf8');
            const x509 = new crypto.X509Certificate(cert);
            return { key, cert, fingerprint: x509.fingerprint256 };
        } catch (e) {
            console.warn('[RSM-TLS] Could not read existing cert, regenerating:', e.message);
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
ipcMain.handle('get-servers', () => managedServers);

// --- SAVE SERVER LIST (with persistence logic for running servers) ---
ipcMain.on('save-servers', (event, updatedList) => {
    managedServers = updatedList.map(newSrv => {
        const existing = managedServers.find(s => s.id === newSrv.id);
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
    saveApiConfig(config);
    if (config.enabled && config.apiKey) {
        const tls = ensureTlsCert();
        apiServer.start(config.port || 3002, config.apiKey, { key: tls.key, cert: tls.cert });
    } else {
        apiServer.stop();
    }
    console.log(`[RSM] API server ${config.enabled ? `started on port ${config.port}` : 'stopped'}.`);
});

ipcMain.handle('regenerate-api-key', () => {
    const config = loadApiConfig();
    config.apiKey = apiServer.generateApiKey();
    if (!config.port) config.port = 3002;
    saveApiConfig(config);
    if (config.enabled) {
        const tls = ensureTlsCert();
        apiServer.start(config.port, config.apiKey, { key: tls.key, cert: tls.cert });
    }
    console.log('[RSM] API key regenerated.');
    return config;
});

// --- ADMIN CHECK ---
ipcMain.handle('check-admin', async () => {
    return new Promise((resolve) => {
        exec('net session', (err) => {
            resolve(!err);
        });
    });
});


//      _        _   _   _ _   _  ____ _   _   ____  _____ ______     _______ ____
//     | |      / \ | | | | \ | |/ ___| | | | / ___|| ____|  _ \ \   / / ____|  _ \
//     | |     / _ \| | | |  \| | |   | |_| | \___ \|  _| | |_) \ \ / /|  _| | |_) |
//     | |___ / ___ \ |_| | |\  | |___|  _  |  ___) | |___|  _ < \ V / | |___|  _ <
//     |_____/_/   \_\___/|_| \_|\____|_| |_| |____/|_____|_| \_\ \_/  |_____|_| \_\
//

// --- SERVER START LOGIC ---
ipcMain.on('start-server', (event, srv) => {
    event.reply('system-info', `[RSM] Gathering information for: ${srv.name}`);
    DebugLog(`Starting server with config:`, srv);

    srv.status = 'Starting';
    srv.pid = null;
    const workingDir = srv.workingDir || path.dirname(srv.path);
    const exeName = path.basename(srv.path);
    const serverCategory = findServType(srv);
    const argArray = srv.args ? srv.args.split(' ').filter(a => a.trim() !== "") : [];
    const psArgs = argArray.join(' ').replace(/'/g, "''");

    let child;
    let actualGamePid = 0;
    let searchRetry = null;
    let monitorInterval = null;
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

        const index = managedServers.findIndex(s => s.id === srv.id);
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

        if (serverCategory !== 'DIRECT_CONSOLE') {
            if (srv.logPath && fs.existsSync(srv.logPath)) {
                logWatcher = startLogging(srv.logPath, event, srv);
            } else DebugLog(`[RSM-DEBUG] No valid logPath found for ${srv.name}. Watcher not started.`);
        } else {
            DebugLog(`[RSM-DEBUG] ${srv.name} is a UI based server. Using shell pipe instead of file watcher.`);
        }

        activeProcesses[srv.id] = { pid: pid, shell: child, cleanup: stopServerCleanup };
        DebugLog(`Registered ${srv.name} in activeProcesses.`);

        startHeartbeat(pid, srv);
    }

    const stopServerCleanup = () => {
        DebugLog(`Initiating cleanup for ${srv.name}...`);

        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
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

        delete activeProcesses[srv.id];
        delete serverStats[srv.id];
        event.reply('status-change', { id: srv.id, status: 'Offline' });
        event.reply('system-info', `[RSM] ${srv.name} has been cleaned up and set to Offline.`);

        DebugLog(`Cleanup complete for ${srv.name}. Status: Offline.`);
    };

    const startHeartbeat = (pid, serverObject) => {
        if (monitorInterval) clearInterval(monitorInterval);

        const totalRamMB = Math.floor(os.totalmem() / 1024 / 1024);
        const numCores = os.cpus().length;
        const srvId = serverObject.id;
        const srvName = serverObject.name;

        // CPU delta state — KernelModeTime+UserModeTime are 100-ns counters;
        // we diff two readings across the heartbeat interval to get real %
        let prevCpuTime = 0;
        let prevCpuSample = 0;

        if (!pid || pid === 0) return;

        monitorInterval = setInterval(() => {
            exec(`tasklist /fi "PID eq ${pid}" /fo csv /nh`, (err, stdout) => {
                const isStillRunning = stdout && stdout.includes(`"${pid}"`);

                if (!isStillRunning) {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('server-perf-update', {
                            id: srvId,
                            cpu: 0,
                            ramPercent: 0,
                            ramDisplay: "Offline"
                        });
                    }
                    stopServerCleanup();
                    return;
                }

                const parts = stdout.split('","');
                if (parts.length >= 5) {
                    const memRaw = parts[4].replace(/[^\d]/g, '');
                    const memMB = Math.floor(parseInt(memRaw) / 1024);
                    const displayMem = memMB > 1024 ? (memMB / 1024).toFixed(2) + " GB" : memMB + " MB";
                    const ramPercent = Math.min(Math.floor((memMB / totalRamMB) * 100), 100);

                    exec(`wmic process where processid=${pid} get KernelModeTime,UserModeTime /value`, (cpuErr, cpuStdout) => {
                        let cpuPercent = 0;

                        if (!cpuErr && cpuStdout) {
                            const kMatch = cpuStdout.replace(/\s/g, '').match(/KernelModeTime=(\d+)/);
                            const uMatch = cpuStdout.replace(/\s/g, '').match(/UserModeTime=(\d+)/);

                            if (kMatch && uMatch) {
                                const currentTotal = parseInt(kMatch[1]) + parseInt(uMatch[1]);
                                const now = Date.now();

                                if (prevCpuTime > 0) {
                                    const elapsed100ns = (now - prevCpuSample) * 10000;
                                    const delta = currentTotal - prevCpuTime;
                                    cpuPercent = Math.min(Math.round((delta / elapsed100ns / numCores) * 100), 100);
                                }

                                prevCpuTime = currentTotal;
                                prevCpuSample = now;
                            }
                        }

                        const finalCpu = isNaN(cpuPercent) ? 0 : cpuPercent;
                        const finalRam = isNaN(ramPercent) ? 0 : ramPercent;

                        serverStats[srvId] = { cpu: finalCpu, ramMB: memMB };

                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('server-perf-update', {
                                id: srvId,
                                cpu: finalCpu,
                                ramPercent: finalRam,
                                ramDisplay: displayMem
                            });

                            DebugCpuRam(`[RSM] Sent Update for ${srvName}: CPU ${finalCpu}% | RAM ${finalRam}%`);
                        }
                    });
                }
            });
        }, 2000);
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
        child = spawn('powershell.exe', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
            `$p = Start-Process -FilePath '${srv.path}' -ArgumentList '${psArgs}' -WorkingDirectory '${workingDir}' -WindowStyle Hidden -PassThru;
            Write-Output "PID_MARKER:$($p.Id)";
            while($null -ne (Get-Process -Id $p.Id -ErrorAction SilentlyContinue)) { Start-Sleep -Seconds 5 }`
        ], { cwd: workingDir, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
        DebugLog(`Launched PowerShell bridge for ${srv.name} with PID ${child.pid}`);
    }

    child.stdout.on('data', (data) => {
        let msg = data.toString();
        if (!msg.endsWith('\n')) msg += '\n';

        DebugConsoleLogs(`[STDOUT][${srv.name}]: ${msg.trim()}`);

        if (serverCategory === 'DIRECT_CONSOLE') {
            event.reply('console-out', { id: srv.id, msg: msg });
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

    child.stderr.on('data', (data) => {
        let msg = data.toString();
        if (DebugActive) console.log(`[STDERR][${srv.name}]: ${msg.trim()}`);
        if (serverCategory === 'DIRECT_CONSOLE') {
            event.reply('console-out', { id: srv.id, msg: `[WARN] ${msg}` });
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
                        performSearch(child.pid, exeName, workingDir, finalizeProcess, event);
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
ipcMain.on('stop-server', (event, srvId) => {
    DebugLog(`Received stop-server request for ID: ${srvId}`);
    event.reply('system-info', `[RSM] Stop signal received for: ${srvId}`);

    let processInfo = activeProcesses[srvId] || activeProcesses[srvId.toString()];
    DebugLog(`Initial lookup for ${srvId}:`, processInfo ? `PID ${processInfo.pid}` : "Not found");

    if (!processInfo) {
        const foundKey = Object.keys(activeProcesses).find(key =>
            activeProcesses[key].pid.toString() === srvId.toString()
        );
        if (foundKey) processInfo = activeProcesses[foundKey];
        DebugLog(`Attempted alternative lookup for ${srvId}. Found key: ${foundKey || "None"}`);
    }

    if (!processInfo || !processInfo.pid) {
        event.reply('system-info', `[RSM-WARN] Stop failed: No active process found for ${srvId}`);
        DebugLog(`No process info found for ${srvId}. Active processes:`, activeProcesses);
        return;
    }

    const { pid, shell, cleanup } = processInfo;
    event.reply('system-info', `[RSM] Identifying PID ${pid}. Sending graceful shutdown sequence...`);
    DebugLog(`Preparing to stop PID ${pid} with shell:`, !!shell);

    // Track A: Command Injection (Minecraft/Java)
    try {
        if (shell && shell.stdin && shell.stdin.writable) {
            shell.stdin.write("/save-all\r\n");
            console.log(`[RSM-DEBUG] Sent 'save-all' command to PID ${pid} stdin.`);
            shell.stdin.write("/stop\r\n");
            console.log(`[RSM-DEBUG] Sent 'stop' command to PID ${pid} stdin.`);
            shell.stdin.write("/exit\r\n");
            event.reply('system-info', `[RSM] Sent 'Exit' commands to stdin.`);
        }
    } catch (e) {
        console.log("[RSM] Stdin write skipped.");
    }

    // Track B: Windows Signal (Space Engineers / General)
    const stopCmd = `
        $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue;
        if ($p) {
            $p.CloseMainWindow();
            Start-Sleep -Seconds 2;
            if (!$p.HasExited) {
                Stop-Process -Id ${pid} -Confirm:$false;
            }
        }
    `;

    exec(`powershell -Command "${stopCmd.replace(/\n/g, ' ')}"`, (err, stdout, stderr) => {
        if (err) {
            event.reply('system-info', `[RSM-DEBUG] OS Signal Feedback: ${stderr || "Process may have already closed."}`);
        } else {
            event.reply('system-info', `[RSM] Windows OS has acknowledged the stop request for PID ${pid}.`);
        }
        if (typeof cleanup === 'function') {
            cleanup();
        }
    });

    event.reply('system-info', `[RSM] Shutdown signals sent. Monitoring for exit...`);
});

// --- FORCE KILL LOGIC ---
ipcMain.on('kill-server', (event, pid) => {
    if (!pid) return;

    event.reply('system-info', `Sending TaskKill command to PID ${pid}...`);

    exec(`taskkill /F /T /PID ${pid}`, (err) => {
        if (err) {
            console.error(`Failed to kill process ${pid}:`, err);
        } else {
            console.log(`[RSM] Process tree ${pid} force terminated.`);
        }
    });
});


//      ___ ___  _   _ ____  ___  _     _____     ____  ___  __  __ __  __    _    _   _ ____  ____
//     / __/ _ \| \ | / ___||_ _|| |   | ____|   / ___/ _ \|  \/  |  \/  |  / \  | \ | |  _ \/ ___|
//    | (_| | | |  \| \___ \ | | | |   |  _|    | |  | | | | |\/| | |\/| | / _ \ |  \| | | | \___ \
//    \__ | |_| | |\  |___) || | | |___| |___   | |__| |_| | |  | | |  | |/ ___ \| |\  | |_| |___) |
//    |___/\___/|_| \_|____/|___||_____|_____|   \____\___/|_|  |_|_|  |_/_/   \_|_| \_|____/|____/
//

// --- LOG TAILING FUNCTION ---
const startLogging = (logFolderPath, event, srv) => {
    const encodingMap = {
        'spaceengineers': 'utf16le',
        'minecraft': 'utf8',
        'default': 'utf8'
    };

    const selectedEncoding = encodingMap[srv.type?.toLowerCase()] || encodingMap['default'];

    DebugConsoleLogs(`[RSM-DEBUG] Initializing Log Watcher`);
    DebugConsoleLogs(`[RSM-DEBUG] Target: ${srv.name} | Type: ${srv.type} | Encoding: ${selectedEncoding}`);

    try {
        const getNewestLog = () => {
            if (!fs.existsSync(logFolderPath)) return null;
            const files = fs.readdirSync(logFolderPath)
                .filter(f => f.endsWith('.log'))
                .map(f => ({
                    name: f,
                    time: fs.statSync(path.join(logFolderPath, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);
            return files.length > 0 ? path.join(logFolderPath, files[0].name) : null;
        };

        const newestLog = getNewestLog();
        if (!newestLog) {
            DebugConsoleLogs(`Cancelled: No .log files found in ${logFolderPath}`);
            return null;
        }

        DebugLog(`Tailing: ${path.basename(newestLog)}`);
        let lastSize = fs.statSync(newestLog).size;

        return setInterval(() => {
            try {
                const stats = fs.statSync(newestLog);
                if (stats.size > lastSize) {
                    const bufferSize = stats.size - lastSize;
                    const buffer = Buffer.alloc(bufferSize);

                    const fd = fs.openSync(newestLog, 'r');
                    fs.readSync(fd, buffer, 0, bufferSize, lastSize);
                    fs.closeSync(fd);

                    lastSize = stats.size;

                    const incomingText = buffer.toString(selectedEncoding).replace(/\0/g, '');

                    if (DebugLogging) {
                        console.log(`[RSM-DEBUG] Captured ${bufferSize} bytes from ${srv.name}`);
                        console.log(`[RSM-DEBUG] Raw Preview: ${incomingText.substring(0, 50).replace(/\n/g, '\\n')}...`);
                    }

                    const rawLines = incomingText.split(/\r?\n/);
                    const cleanLines = rawLines.filter(line => {
                        const low = line.toLowerCase();
                        const isSpam = low.includes('elasticsearch') ||
                            low.includes('collision shapes') ||
                            low.includes('analytics') ||
                            low.includes('| ') ||
                            low.includes('| memory') ||
                            low.includes('| statistics');
                        return line.trim() !== '' && !isSpam;
                    });

                    DebugConsoleLogs(`[RSM-DEBUG] Lines processed: ${rawLines.length} | Lines kept: ${cleanLines.length}`);

                    const formattedOutput = cleanLines.map(line => {
                        return line.replace(/Thread:\s+\d+\s+->\s+/, '| ');
                    }).join('\n');

                    if (formattedOutput.trim()) {
                        event.reply('console-out', { id: srv.id, msg: formattedOutput + '\n' });
                    }
                }
            } catch (e) {
                if (DebugActive && e.code !== 'EBUSY') {
                    console.log(`[RSM-DEBUG] Loop Error for ${srv.name}: ${e.message}`);
                }
            }
        }, 1000);
    } catch (err) {
        console.error(`[RSM-DEBUG] Critical Watcher Failure: ${err.message}`);
    }
};

// --- COMMAND INJECTION LOGIC ---
ipcMain.on('send-command', async (event, { srvId, command }) => {
    console.log(`[RSM] send-command — srvId: ${srvId} | command: "${command}"`);
    const processInfo = activeProcesses[srvId];
    if (!processInfo || !processInfo.shell) {
        event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] Server is not active. Cannot send command.\n` });
        return;
    }

    const srv = managedServers.find(s => s.id === srvId);
    if (!srv) return;

    const cleanCmd = command.trim();
    if (!cleanCmd) return;

    const serverCategory = findServType(srv);

    // Direct Input (Shell servers: Minecraft, 7DaysToDie, etc.)
    if (serverCategory === 'DIRECT_CONSOLE') {
        const childProc = processInfo.shell;

        if (childProc.stdin && childProc.stdin.writable) {
            try {
                childProc.stdin.write(cleanCmd + "\n");
                event.reply('console-out', { id: srvId, msg: `> ${cleanCmd}\n` });
            } catch (err) {
                event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] Failed to write to console: ${err.message}\n` });
            }
        } else {
            event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] Console input is blocked or not available.\n` });
        }
    }
    // Space Engineers (VRage Remote HTTP API)
    else if (srv.type === 'space-engineers') {
        if (!srv.apiPort || !srv.apiPass) {
            event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] API Port and Password are required for Space Engineers commands.\n` });
            return;
        }

        const port = srv.apiPort || 8080;
        const password = srv.apiPass || "";
        const url = `http://localhost:${port}/vrageremote/v1/server/command`;

        try {
            await axios.post(url,
                { "Command": cleanCmd },
                {
                    headers: {
                        'Remote-Control-Http-Password': password,
                        'Content-Type': 'application/json'
                    },
                    timeout: 2000
                }
            );
            event.reply('console-out', { id: srvId, msg: `> ${cleanCmd}\n` });
        } catch (err) {
            const errorMsg = err.response ? `Code ${err.response.status}` : err.message;
            event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] SE API Failed: ${errorMsg}\n` });
        }
    }
    // RCON Protocol (Ark and other POWERSHELL_BRIDGE servers)
    else if (serverCategory === 'POWERSHELL_BRIDGE') {
        if (!srv.apiPort || !srv.apiPass) {
            event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] RCON Port and Password are required to send commands.\n` });
            return;
        }

        const port = parseInt(srv.apiPort);
        const password = srv.apiPass || "";

        try {
            const rcon = await Rcon.connect({
                host: 'localhost',
                port: port,
                password: password,
                timeout: 2000
            });

            const response = await rcon.send(cleanCmd);
            rcon.end();
            event.reply('console-out', { id: srvId, msg: `> ${cleanCmd}\n${response ? response + '\n' : ''}` });

        } catch (err) {
            event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] RCON Failed: ${err.message}\n` });
        }
    }
});

// --- PLAYER COUNT & SESSION INFO ---
ipcMain.on('get-player-count', async (event, srvId) => {
    const srv = managedServers.find(s => s.id === srvId);
    const processInfo = activeProcesses[srvId];
    if (!srv || !processInfo) return;

    const type = (srv.type || '').toLowerCase();
    console.log(`[RSM] get-player-count — srvId: ${srvId} | type: ${type}`);

    // Minecraft: write 'list' to stdin; parsed in renderer's console-out handler
    if (type === 'minecraft') {
        const shell = processInfo.shell;
        if (shell?.stdin?.writable) shell.stdin.write('list\n');
        return;
    }

    // Space Engineers: HTTP API returns session info + player list in one call
    if (type === 'space-engineers') {
        try {
            const port = srv.apiPort || 8080;
            const pass = srv.apiPass || '';
            const headers = pass ? { Authorization: `Basic ${Buffer.from(`:${pass}`).toString('base64')}` } : {};
            const res = await axios.get(`http://localhost:${port}/v1/session`, { headers, timeout: 3000 });
            const session = res.data?.data || res.data || {};
            const playerCount = session.Players ?? null;
            const worldName = session.WorldName || session.Name || null;
            event.reply('player-count-update', {
                id: srvId,
                players: playerCount !== null ? `${playerCount} / ${session.MaxPlayers ?? '?'}` : null,
                world: worldName
            });
        } catch (_) {
            event.reply('player-count-update', { id: srvId, players: null, world: null });
        }
        return;
    }

    // Ark: RCON 'ListPlayers' returns a plain-text list, one player per line
    if (type === 'ark') {
        try {
            const rcon = new Rcon({ host: 'localhost', port: parseInt(srv.apiPort) || 27020, password: srv.apiPass || '' });
            await rcon.connect();
            const response = await rcon.send('ListPlayers');
            await rcon.end();
            const lines = response.trim().split('\n').filter(l => l.match(/^\d+\./));
            event.reply('player-count-update', {
                id: srvId,
                players: `${lines.length} connected`,
                world: null
            });
        } catch (_) {
            event.reply('player-count-update', { id: srvId, players: null, world: null });
        }
        return;
    }

    event.reply('player-count-update', { id: srvId, players: null, world: null });
});


//      _____ ___  _     ____  _____ ____    _   _    _    _   _ ____  _     ___ _   _  ____
//     |  ___/ _ \| |   |  _ \| ____|  _ \  | | | |  / \  | \ | |  _ \| |   |_ _| \ | |/ ___|
//     | |_ | | | | |   | | | |  _| | |_) | | |_| | / _ \ |  \| | | | | |    | ||  \| | |  _
//     |  _|| |_| | |___| |_| | |___|  _ <  |  _  |/ ___ \| |\  | |_| | |___ | || |\  | |_| |
//     |_|   \___/|_____|____/|_____|_| \_\ |_| |_/_/   \_\_| \_|____/|_____|___|_| \_|\____|
//

// --- OPENING FILE DIALOGS ---
ipcMain.handle('open-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Game Servers', extensions: ['exe', 'bat', 'cmd', 'jar', 'ps1', 'ps', 'sh'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result.canceled ? null : result.filePaths[0];
});

// --- OPENING FOLDER DIALOGS ---
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
});

// --- CONFIG FILE READ/WRITE ---
ipcMain.handle('get-desktop-path', () => app.getPath('desktop'));

// --- FIREWALL RULE MANAGEMENT (Portier integration) ---
ipcMain.handle('check-firewall-rules', async (event, { serverName }) => {
    console.log(`[RSM] check-firewall-rules — serverName: "${serverName}"`);
    const safeName = serverName.replace(/'/g, "''");
    const script = `$rules = Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'RSM - ${safeName} - *' }\nif ($rules) { Write-Output 'ACTIVE' } else { Write-Output 'NONE' }`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return new Promise((resolve) => {
        exec(`powershell.exe -NonInteractive -NoProfile -WindowStyle Hidden -EncodedCommand ${encoded}`, (err, stdout) => {
            const result = (stdout || '').trim() === 'ACTIVE';
            console.log(`[RSM] check-firewall-rules — result: ${result}`);
            resolve(result);
        });
    });
});

ipcMain.handle('apply-firewall-rules', async (event, { serverName, ports }) => {
    console.log(`[RSM] apply-firewall-rules — serverName: "${serverName}" | ports: ${ports?.length || 0}`);
    const safeName = serverName.replace(/'/g, "''");
    const lines = [
        `Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'RSM - ${safeName} - *' } | Remove-NetFirewallRule -ErrorAction SilentlyContinue`
    ];
    for (const p of (ports || [])) {
        const safeLabel = (p.label || p.id || '').replace(/'/g, "''");
        if (p.tcp) lines.push(`New-NetFirewallRule -DisplayName 'RSM - ${safeName} - ${safeLabel} - TCP' -Direction Inbound -Protocol TCP -LocalPort ${p.port} -Action Allow -Group 'Ronin Portier Rules' -ErrorAction SilentlyContinue`);
        if (p.udp) lines.push(`New-NetFirewallRule -DisplayName 'RSM - ${safeName} - ${safeLabel} - UDP' -Direction Inbound -Protocol UDP -LocalPort ${p.port} -Action Allow -Group 'Ronin Portier Rules' -ErrorAction SilentlyContinue`);
    }
    if (lines.length <= 1) return { success: false, error: 'No ports defined.' };
    const encoded = Buffer.from(lines.join('\n'), 'utf16le').toString('base64');
    return new Promise((resolve) => {
        exec(`powershell.exe -NonInteractive -NoProfile -WindowStyle Hidden -EncodedCommand ${encoded}`, (err, stdout, stderr) => {
            console.log(`[RSM] apply-firewall-rules — success: ${!err}${err ? ' | error: ' + (stderr || err.message) : ''}`);
            resolve({ success: !err, error: err ? (stderr || err.message) : null });
        });
    });
});

ipcMain.handle('remove-firewall-rules', async (event, { serverName }) => {
    console.log(`[RSM] remove-firewall-rules — serverName: "${serverName}"`);
    const safeName = serverName.replace(/'/g, "''");
    const script = `Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'RSM - ${safeName} - *' } | Remove-NetFirewallRule -ErrorAction SilentlyContinue`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return new Promise((resolve) => {
        exec(`powershell.exe -NonInteractive -NoProfile -WindowStyle Hidden -EncodedCommand ${encoded}`, (err, stdout, stderr) => {
            console.log(`[RSM] remove-firewall-rules — success: ${!err}${err ? ' | error: ' + (stderr || err.message) : ''}`);
            resolve({ success: !err, error: err ? (stderr || err.message) : null });
        });
    });
});

// --- PORTIER MANAGEMENT VIEW ---
ipcMain.handle('get-firewall-rules', async () => {
    console.log('[RSM] get-firewall-rules — fetching all Portier managed rules');
    const script = `
$rules = Get-NetFirewallRule -Group 'Ronin Portier Rules' -ErrorAction SilentlyContinue
if (-not $rules) { Write-Output '[]'; exit }
$out = $rules | ForEach-Object {
    $r = $_
    $f = $r | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
    [PSCustomObject]@{
        name      = $r.DisplayName
        protocol  = if ($f) { [string]$f.Protocol } else { '' }
        port      = if ($f) { [string]$f.LocalPort } else { '' }
        enabled   = [string]$r.Enabled
    }
}
$out | ConvertTo-Json -Compress`.trim();
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return new Promise((resolve) => {
        exec(`powershell.exe -NonInteractive -NoProfile -WindowStyle Hidden -EncodedCommand ${encoded}`, (err, stdout) => {
            if (err || !stdout.trim()) return resolve([]);
            try {
                const parsed = JSON.parse(stdout.trim());
                const rules = Array.isArray(parsed) ? parsed : [parsed];
                console.log(`[RSM] get-firewall-rules — returned ${rules.length} rule(s)`);
                resolve(rules);
            } catch { resolve([]); }
        });
    });
});

ipcMain.handle('add-firewall-rule', async (event, { displayName, port, tcp, udp }) => {
    console.log(`[RSM] add-firewall-rule — displayName: "${displayName}" | port: ${port} | tcp: ${tcp} | udp: ${udp}`);
    const safeName = displayName.replace(/'/g, "''");
    const lines = [];
    if (tcp) lines.push(`New-NetFirewallRule -DisplayName '${safeName}' -Direction Inbound -Protocol TCP -LocalPort ${port} -Action Allow -Group 'Ronin Portier Rules' -ErrorAction SilentlyContinue`);
    if (udp) lines.push(`New-NetFirewallRule -DisplayName '${safeName}' -Direction Inbound -Protocol UDP -LocalPort ${port} -Action Allow -Group 'Ronin Portier Rules' -ErrorAction SilentlyContinue`);
    if (!lines.length) return { success: false, error: 'Select at least one protocol.' };
    const encoded = Buffer.from(lines.join('\n'), 'utf16le').toString('base64');
    return new Promise((resolve) => {
        exec(`powershell.exe -NonInteractive -NoProfile -WindowStyle Hidden -EncodedCommand ${encoded}`, (err, stdout, stderr) => {
            console.log(`[RSM] add-firewall-rule — success: ${!err}${err ? ' | error: ' + (stderr || err.message) : ''}`);
            resolve({ success: !err, error: err ? (stderr || err.message) : null });
        });
    });
});

ipcMain.handle('check-port-conflicts', async (event, { ports, excludeServerName }) => {
    console.log(`[RSM] check-port-conflicts — ports: ${JSON.stringify(ports)} | exclude: ${excludeServerName || 'none'}`);
    if (!ports?.length) return [];
    const portList = ports.map(p => `'${p}'`).join(', ');
    // Exclude the server's own existing rules so a re-apply doesn't false-positive on itself
    const excludeFilter = excludeServerName
        ? ` -and $rule.DisplayName -notlike 'RSM - ${excludeServerName.replace(/'/g, "''")} - *'`
        : '';
    // Query port filters first (one CIM call), then look up the rule only for matching ports.
    // This is O(matches) CIM calls instead of O(all rules) CIM calls and runs in ~ms vs ~seconds.
    const script = `$check = @(${portList})
$out = @()
Get-NetFirewallPortFilter -ErrorAction SilentlyContinue | ForEach-Object {
    $f = $_
    $lp = @($f.LocalPort) | Where-Object { $_ -match '^[0-9]+$' }
    $matched = $lp | Where-Object { $check -contains $_ }
    if ($matched) {
        $rule = $f | Get-NetFirewallRule -ErrorAction SilentlyContinue
        if ($rule -and $rule.Enabled -eq 'True' -and $rule.Direction -eq 'Inbound'${excludeFilter}) {
            foreach ($mp in $matched) { $out += [PSCustomObject]@{ port = $mp; protocol = [string]$f.Protocol; ruleName = $rule.DisplayName } }
        }
    }
}
if ($out.Count -eq 0) { Write-Output '[]' } else { $out | ConvertTo-Json -Compress }`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return new Promise((resolve) => {
        exec(`powershell.exe -NonInteractive -NoProfile -WindowStyle Hidden -EncodedCommand ${encoded}`, (err, stdout) => {
            if (err || !stdout.trim()) return resolve([]);
            try {
                const parsed = JSON.parse(stdout.trim());
                const conflicts = Array.isArray(parsed) ? parsed : [parsed];
                console.log(`[RSM] check-port-conflicts — found ${conflicts.length} conflict(s)`);
                resolve(conflicts);
            } catch { resolve([]); }
        });
    });
});

ipcMain.handle('remove-firewall-rule', async (event, { displayName }) => {
    console.log(`[RSM] remove-firewall-rule — displayName: "${displayName}"`);
    const safeName = displayName.replace(/'/g, "''");
    const script = `Remove-NetFirewallRule -DisplayName '${safeName}' -ErrorAction SilentlyContinue`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return new Promise((resolve) => {
        exec(`powershell.exe -NonInteractive -NoProfile -WindowStyle Hidden -EncodedCommand ${encoded}`, (err, stdout, stderr) => {
            console.log(`[RSM] remove-firewall-rule — success: ${!err}${err ? ' | error: ' + (stderr || err.message) : ''}`);
            resolve({ success: !err, error: err ? (stderr || err.message) : null });
        });
    });
});

ipcMain.handle('toggle-firewall-rule', async (event, { displayName, enabled }) => {
    console.log(`[RSM] toggle-firewall-rule — displayName: "${displayName}" | enabled: ${enabled}`);
    const safeName = displayName.replace(/'/g, "''");
    const state = enabled ? 'True' : 'False';
    const script = `Set-NetFirewallRule -DisplayName '${safeName}' -Enabled ${state} -ErrorAction SilentlyContinue`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return new Promise((resolve) => {
        exec(`powershell.exe -NonInteractive -NoProfile -WindowStyle Hidden -EncodedCommand ${encoded}`, (err, stdout, stderr) => {
            console.log(`[RSM] toggle-firewall-rule — success: ${!err}${err ? ' | error: ' + (stderr || err.message) : ''}`);
            resolve({ success: !err, error: err ? (stderr || err.message) : null });
        });
    });
});

ipcMain.handle('read-config-file', async (event, filePath) => {
    console.log(`[RSM] read-config-file — filePath: "${filePath}"`);
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        console.log(`[RSM] read-config-file — success, ${content.length} chars`);
        return { success: true, content };
    } catch (err) {
        console.log(`[RSM] read-config-file — failed: ${err.message}`);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('write-config-file', async (event, { filePath, content, backupDir, serverName }) => {
    console.log(`[RSM] write-config-file — filePath: "${filePath}" | backupDir: ${backupDir || 'none'}`);
    let backedUp = false;
    let backupError = null;
    try {
        if (backupDir && serverName) {
            try {
                const serverBackupDir = path.join(backupDir, serverName);
                fs.mkdirSync(serverBackupDir, { recursive: true });
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const baseName = path.basename(filePath);
                const backupPath = path.join(serverBackupDir, `${baseName}-${timestamp}.bak`);
                const existing = fs.readFileSync(filePath, 'utf8');
                fs.writeFileSync(backupPath, existing, 'utf8');
                backedUp = true;
            } catch (backupErr) {
                backupError = backupErr.message;
                console.warn(`[RSM] Backup failed (save will continue): ${backupErr.message}`);
            }
        }
        await fs.promises.writeFile(filePath, content, 'utf8');
        console.log(`[RSM] write-config-file — success | backedUp: ${backedUp}`);
        return { success: true, backedUp, backupError };
    } catch (err) {
        console.log(`[RSM] write-config-file — failed: ${err.message}`);
        return { success: false, backedUp, backupError, error: err.message };
    }
});

// --- OPEN DOCS IN BROWSER ---
ipcMain.on('open-docs', () => {
    shell.openExternal('https://phonicspider.github.io/Ronin-Server-Manager/');
});

// --- WINDOW OPACITY ---
ipcMain.on('update-window-opacity', (event, value) => {
    mainWindow.setOpacity(parseFloat(value));
});

// --- OPEN FOLDER IN EXPLORER ---
ipcMain.on('open-folder', (event, rawData) => {
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
    const workingDir = path.dirname(exePath);

    let command = `start "" "${exeName}"`;

    if (instancePath) {
        const isSE = exeName.toLowerCase().includes('spaceengineers');
        if (isSE) {
            command += ` -path "${instancePath}"`;
        }
    }

    exec(command, { cwd: workingDir }, (err) => {
        if (err) {
            console.error(`[RSM] Failed to launch GUI: ${err}`);
            event.reply('system-info', `[RSM] Error launching GUI: ${err.message}`);
        } else {
            event.reply('system-info', `[RSM] Opening GUI for ${exeName}...`);
        }
    });
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
            entries.reduce((sum, s) => sum + (s.cpu || 0), 0),
            100
        );

        const totalSystemRamMB = Math.floor(os.totalmem() / 1024 / 1024);
        const serverRamMB = entries.reduce((sum, s) => sum + (s.ramMB || 0), 0);
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
        }).catch(() => {});

        // Parse netstat once and emit per-server TCP connection counts
        const activeEntries = Object.entries(activeProcesses);
        if (activeEntries.length > 0) {
            exec('netstat -ano', (nsErr, nsOut) => {
                if (nsErr || !nsOut || !mainWindow || mainWindow.isDestroyed()) return;
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
// Add new server types here when needed.
function findServType(srv) {
    const type = (srv.type || '').toLowerCase();
    DebugLog(`Determining server category for type: '${type}'`);

    switch (type) {
        case 'minecraft':
        case '7daystodie':
        case 'terraria':
            DebugLog(`Category assigned: DIRECT_CONSOLE, for type: '${type}'`);
            return 'DIRECT_CONSOLE';

        case 'space-engineers':
        case 'ark':
        case 'starfield':
            DebugLog(`Category assigned: POWERSHELL_BRIDGE, for type: '${type}'`);
            return 'POWERSHELL_BRIDGE';

        default:
            DebugLog(`Category assigned: DIRECT_CONSOLE, for type: '${type}' due to default case`);
            return 'DIRECT_CONSOLE';
    }
}

// --- UNIVERSAL PROCESS SEARCH (finds the real game PID after PowerShell bridge launches it) ---
function performSearch(parentPid, exeName, workingDir, finalizeCallback, event) {
    const { exec } = require('child_process');
    const searchExe = exeName.toLowerCase();
    const searchDir = workingDir.toLowerCase().replace(/\\/g, '/');

    // PIDs already assigned to other servers — never steal them for a second instance
    const claimedPids = new Set(
        Object.values(activeProcesses).map(p => p.pid).filter(Boolean)
    );

    // Step 1: Search children of the PowerShell bridge filtered by EXE name
    exec(`wmic process where "ParentProcessId=${parentPid}" get CommandLine,ProcessId /format:csv`, (err, stdout) => {
        if (!err && stdout) {
            const lines = stdout.trim().split('\n').filter(l => l.trim());
            for (const line of lines) {
                if (!line.toLowerCase().includes(searchExe)) continue;

                const lastComma = line.lastIndexOf(',');
                if (lastComma !== -1) {
                    const foundPid = parseInt(line.substring(lastComma + 1).trim());
                    if (!isNaN(foundPid) && foundPid !== 0 && !claimedPids.has(foundPid)) {
                        DebugLog(`Deep Search: Found via Parent Link: ${foundPid}`);
                        finalizeCallback(foundPid);
                        return;
                    }
                }
            }
        }

        // Step 2: Search all processes matching EXE name, filtered by working directory
        exec(`wmic process where "Name='${exeName}'" get CommandLine,ProcessId /format:csv`, (err2, stdout2) => {
            if (err2 || !stdout2) return;

            DebugLog(`Performing instance search for EXE: '${searchExe}' in DIR: '${searchDir}'`);

            const lines = stdout2.trim().split('\n').filter(l => l.trim());
            for (const line of lines) {
                const lineLow = line.toLowerCase().replace(/\\/g, '/');
                if (!lineLow.includes(searchExe)) continue;

                const lastComma = line.lastIndexOf(',');
                if (lastComma === -1) continue;

                const foundPid = parseInt(line.substring(lastComma + 1).trim());
                if (isNaN(foundPid) || foundPid === 0 || foundPid === parentPid || claimedPids.has(foundPid)) continue;

                if (lineLow.includes(searchDir)) {
                    DebugLog(`Deep Search: Found via Instance Match (EXE + dir): ${foundPid}`);
                    finalizeCallback(foundPid);
                    return;
                }
            }

            DebugLog(`Deep Search: No unclaimed instance found yet, will retry...`);
        });
    });
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
