const { app, BrowserWindow, shell, ipcMain, dialog, Tray, Menu, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec, execSync } = require('child_process');
const si = require('systeminformation');
const os = require('os');
let mainWindow;
let tray = null;
const activeProcesses = {};
const DATA_FILE = path.join(app.getPath('userData'), 'servers.json');
const debugPrefix = "[RSM-DEBUG]";
const DebugActive = true; // Set to true to enable verbose logging for debugging purposes
const DebugLogging = false; // Set to true to enable debug logging for all operations (not just critical ones)
const DebugCPURAM = false; // Set to true to enable detailed CPU/RAM logging in the performance update loop

//      ___ _   _ ___ _____ ___    _    _     ___ __________
//     |_ _| \ | |_ _|_   _|_ _|  / \  | |   |_ _|__  / ____|
//      | ||  \| || |  | |  | |  / _ \ | |    | |  / /|  _|
//      | || |\  || |  | |  | | / ___ \| |___ | | / /_| |___
//     |___|_| \_|___| |_| |___/_/   \_\_____|___/____|_____|
//

// --- DATA PERSISTENCE ---
function loadServers() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        } catch (e) {
            console.error("[RSM] Failed to load servers.json:", e);
            return [];
        }
    }
    return [];
}

let managedServers = loadServers();

// --- WINDOW CREATION & CONFIGURATION ---
function createWindow() {
    // If window already exists, don't create a new one
    if (mainWindow) return;

    mainWindow = new BrowserWindow({
        width: 1250,
        height: 850,
        title: "Ronin Server Manager",
        icon: path.join(__dirname, 'icon.png'),
        backgroundColor: '#0f111a',
        hasShadow: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'public/index.html'));

    // Handle "Close to Tray" logic
    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

// --- SYSTEM TRAY CREATION & LOGIC ---
function createTray() {
    // 1. Create the Tray Icon
    const iconPath = path.join(__dirname, 'icon.png');
    tray = new Tray(fs.existsSync(iconPath) ? iconPath : path.join(__dirname, 'public/index.html'));

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => mainWindow.show() },
        {
            label: 'Quit RoninManager', click: () => {
                app.isQuiting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('RoninManager: Servers Running');
    tray.setContextMenu(contextMenu);

    // 2. Handle Tray Click
    tray.on('click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });

    // 3. The "Minimize to Tray" Logic
    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });
}

// --- STARTUP SYNC AND PROCESS RE-LINKING ---
function syncActiveServers() { //
    console.log("[RSM] Scanning for orphaned server processes...");

    // Command to get process list with titles and PIDs in CSV format
    exec('tasklist /v /fo csv', (err, stdout) => {
        if (err) return;

        const lines = stdout.split('\n');
        managedServers.forEach(srv => {
            const fileName = path.basename(srv.path).toLowerCase();

            // Look for a line containing the executable name
            const match = lines.find(line => line.toLowerCase().includes(fileName));

            if (match) {
                const parts = match.split('","');
                const pid = parseInt(parts[1]);

                console.log(`[RSM] Found existing process for ${srv.name} (PID: ${pid})`);

                // Re-link internally
                activeProcesses[srv.id] = { pid: pid };

                // Tell the UI to update the status dot
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


// --- ADMIN CHECK (For features that require elevated permissions, like certain server types or log access) ---
ipcMain.handle('check-admin', async () => {
    return new Promise((resolve) => {
        exec('net session', (err) => {
            resolve(!err); // If no error, we are admin
        });
    });
});

// --- GET SERVER LIST & SETTINGS ---
ipcMain.handle('get-servers', () => managedServers);

// --- SAVE SERVER LIST & SETTINGS (With Persistence Logic) ---
ipcMain.on('save-servers', (event, updatedList) => {
    managedServers = updatedList.map(newSrv => {
        // Look for the existing version of this server in our memory
        const existing = managedServers.find(s => s.id === newSrv.id);

        return {
            ...newSrv,
            // If it's already running, keep its PID and status!
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
        path: app.getPath('exe') // Points to your app's location
    });
    console.log(`[RSM] Launch on startup set to: ${isEnabled}`);
});

// --- Global Total Usage (Runs once, not per server) ---
setInterval(() => {
    const totalRamUsage = ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(0);
    // Note: CPU usage in Node is best handled with a library or a quick os.loadavg()
    mainWindow.webContents.send('total-performance-update', {
        cpu: (os.loadavg()[0] * 10).toFixed(0), // Rough estimate for Windows
        ram: `${totalRamUsage}%`
    });
}, 5000);

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

    // --- LIFECYCLE ---
    function finalizeProcess(pid) {
        if (srv.status === 'Online' && srv.pid === pid && logWatcher) return;
        DebugLog(`Finalizing process for ${srv.name}: PID ${pid}`);

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

        // 1. Update the UI state
        event.reply('server-status-update', { id: srv.id, status: 'Online', pid: pid });

        // 2. Hybrid Log Logic: if (DebugActive) console.log(`[RSM-DEBUG] 
        // Direct Consoles already have child.stdout active.
        // Dedicated EXEs need the File Watcher.
        if (serverCategory !== 'DIRECT_CONSOLE') {
            if (srv.logPath && fs.existsSync(srv.logPath)) {
                // Note: Make sure startLogging returns the interval!
                logWatcher = startLogging(srv.logPath, event, srv);
            } else DebugLog(`[RSM-DEBUG] No valid logPath found for ${srv.name}. Watcher not started.`);
            
        } else {
            DebugLog(`[RSM-DEBUG] ${srv.name} is a UI based server. Using shell pipe instead of file watcher.`);
        }

        activeProcesses[srv.id] = { pid: pid, shell: child };
        DebugLog(`Registered ${srv.name} in activeProcesses.`);

        // 3. Start your Heartbeat monitor
        // (Assuming you have a heartbeat function that checks if srv.pid is still running)
        startHeartbeat(pid, srv);
    }

    // --- RRSM Unified Cleanup Function ---
    // This handles stopping the heartbeat, closing logs, and updating the UI
    const stopServerCleanup = () => {
        DebugLog(`Initiating cleanup for ${srv.name}...`);

        // 1. Stop the Heartbeat
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
            DebugLog(`Stopped heartbeat monitor for ${srv.name}.`);
        }

        // 2. Stop the Log Watcher
        if (logWatcher) {
            clearInterval(logWatcher);
            logWatcher = null;
            DebugLog(`Stopped log watcher for ${srv.name}.`);
        }

        // 3. Stop any pending Deep Search
        if (searchRetry) {
            clearInterval(searchRetry);
            searchRetry = null;
            DebugLog(`Stopped search retry interval for ${srv.name}.`);
        }

        // 4. Update the Global State and UI
        delete activeProcesses[srv.id];
        event.reply('status-change', { id: srv.id, status: 'Offline' });
        event.reply('system-info', `[RSM] ${srv.name} has been cleaned up and set to Offline.`);

        DebugLog(`Cleanup complete for ${srv.name}. Status: Offline.`);
    };

    // This checks every 15 seconds if the actual game process is still in the Windows Task List.
    // If the PID disappears (crash or manual close), it triggers the cleanup logic.
    const startHeartbeat = (pid, serverObject) => {
        if (monitorInterval) clearInterval(monitorInterval);

        // Lock these in now so they are never undefined later
        const totalRamMB = Math.floor(os.totalmem() / 1024 / 1024);
        const srvId = serverObject.id;
        const srvName = serverObject.name;

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
                    // RAM Calculation
                    const memRaw = parts[4].replace(/[^\d]/g, '');
                    const memMB = Math.floor(parseInt(memRaw) / 1024);
                    const displayMem = memMB > 1024 ? (memMB / 1024).toFixed(2) + " GB" : memMB + " MB";
                    const ramPercent = Math.min(Math.floor((memMB / totalRamMB) * 100), 100);

                    // CPU Check
                    exec(`wmic process where processid=${pid} get PercentProcessorTime /value`, (cpuErr, cpuStdout) => {
                        let cpuPercent = 0;

                        if (!cpuErr && cpuStdout) {
                            const match = cpuStdout.replace(/\s/g, '').match(/PercentProcessorTime=(\d+)/);
                            if (match && match[1]) {
                                // Use Math.round and ensure we have a base-10 integer
                                cpuPercent = Math.round(parseInt(match[1], 10));
                            }
                        }

                        // DATA SAFETY: Ensure we are only sending numbers
                        const finalCpu = isNaN(cpuPercent) ? 0 : cpuPercent;
                        const finalRam = isNaN(ramPercent) ? 0 : ramPercent;

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
        }, 5000); // 5 seconds is a good balance between "alive" and "low overhead"
    };

    if (DebugActive) console.log("[RSM-DEBUG] Category identified as:", serverCategory);
    // --- EXECUTION ---
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

    // --- SINGLE CONSOLIDATED STDOUT HANDLER ---
    child.stdout.on('data', (data) => {
        let msg = data.toString();
        if (!msg.endsWith('\n')) msg += '\n';

        DebugConsoleLogs(`[STDOUT][${srv.name}]: ${msg.trim()}`);

        // 2. Direct Console (Minecraft) pipe
        if (serverCategory === 'DIRECT_CONSOLE') {
            event.reply('console-out', { id: srv.id, msg: msg });
        }

        // 3. PID Marker Detection
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

    // --- INITIALIZATION DELAY ---
    setTimeout(() => {
        if (!child || !child.pid) return;
        if (actualGamePid === 0) {
            if (serverCategory === 'DIRECT_CONSOLE') {
                finalizeProcess(child.pid);
            } else {
                searchRetry = setInterval(() => {
                    if (srv.status !== 'Online') { // Only search if we aren't online yet
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

//      ____ _____ ___  ____    ____  _____ ______     _______ ____
//     / ___|_   _/ _ \|  _ \  / ___|| ____|  _ \ \   / / ____|  _ \
//     \___ \ | || | | | |_) | \___ \|  _| | |_) \ \ / /|  _| | |_) |
//      ___) || || |_| |  __/   ___) | |___|  _ < \ V / | |___|  _ <
//     |____/ |_| \___/|_|     |____/|_____|_| \_\ \_/  |_____|_| \_\
//                                                                   

// --- SERVER STOP LOGIC ---
ipcMain.on('stop-server', (event, srvId) => {
    // 1. Initial Logging
    DebugLog(`Received stop-server request for ID: ${srvId}`);
    event.reply('system-info', `[RSM] Stop signal received for: ${srvId}`);

    // 2. Robust Lookup
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

    const { pid, shell } = processInfo;
    event.reply('system-info', `[RSM] Identifying PID ${pid}. Sending graceful shutdown sequence...`);
    DebugLog(`Preparing to stop PID ${pid} with shell:`, !!shell);

    // --- TRACK A: Command Injection (Minecraft/Java) ---
    try {
        if (shell && shell.stdin && shell.stdin.writable) {
            shell.stdin.write("/save-all\r\n"); // This command is recognized by Minecraft and many Java-based servers to trigger an immediate save of all world data. By sending this before "stop", we give the server a chance to save progress before shutting down.
            console.log(`[RSM-DEBUG] Sent 'save-all' command to PID ${pid} stdin.`);
            shell.stdin.write("/stop\r\n"); // This is the standard Minecraft server command to save and stop. For other Java-based servers, "stop" is often recognized as well. This allows us to trigger a graceful shutdown that lets the server save progress and close properly.
            console.log(`[RSM-DEBUG] Sent 'stop' command to PID ${pid} stdin.`);
            shell.stdin.write("/exit\r\n"); // This ensures that if the server is running in a shell that requires an explicit exit command, it will close after processing the stop command. This is a safety measure to help ensure the process terminates as expected.
            event.reply('system-info', `[RSM] Sent 'Exit' commands to stdin.`);
        }
    } catch (e) {
        console.log("[RSM] Stdin write skipped.");
    }

    // --- TRACK B: Windows Signal (Space Engineers/General) ---
    // UPDATED: We use Stop-Process without -Force first. 
    // This allows the application to catch the 'Closing' event and save.
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
    });

    event.reply('system-info', `[RSM] Shutdown signals sent. Monitoring for exit...`);


    // --- Track C: Post-Shutdown Verification ---
    // We check after 10s. If it's gone, we trigger the UI cleanup.
    setTimeout(() => {
        exec(`tasklist /fi "PID eq ${pid}"`, (err, stdout) => {
            const isStillAlive = stdout && stdout.includes(pid.toString());

            if (!isStillAlive) {
                event.reply('system-info', `[RSM] Shutdown verified. Cleaning up registry...`);
                DebugLog(`PID ${pid} no longer in tasklist. Proceeding with cleanup.`);
                // This ensures the Heartbeat stops and the UI flips to Offline
                if (typeof stopServerCleanup === 'function') {
                    stopServerCleanup();
                }
            } else {
                event.reply('console-out', {
                    id: srvId,
                    msg: `\n[RSM-WARN] PID ${pid} is still active. It may be finalizing a large save file.\n`
                });
            }
        });
    }, 10000);
});

// --- FORCE KILL LOGIC (For Unresponsive Servers) ---
ipcMain.on('kill-server', (event, pid) => {
    if (!pid) return;

    event.reply('system-info', `Sending TaskKill command to PID ${pid}...`);

    // /F = Force, /T = Tree (kills children), /PID = process id
    exec(`taskkill /F /T /PID ${pid}`, (err) => {
        if (err) {
            console.error(`Failed to kill process ${pid}:`, err);
        } else {
            console.log(`[RSM] Process tree ${pid} force terminated.`);
        }
    });
});

//      _____ ___  _     ____  _____ ____    _   _    _    _   _ ____  _     ___ _   _  ____
//     |  ___/ _ \| |   |  _ \| ____|  _ \  | | | |  / \  | \ | |  _ \| |   |_ _| \ | |/ ___|
//     | |_ | | | | |   | | | |  _| | |_) | | |_| | / _ \ |  \| | | | | |    | ||  \| | |  _
//     |  _|| |_| | |___| |_| | |___|  _ <  |  _  |/ ___ \| |\  | |_| | |___ | || |\  | |_| |
//     |_|   \___/|_____|____/|_____|_| \_\ |_| |_/_/   \_\_| \_|____/|_____|___|_| \_|\____|
//                                                                                           

// --- OPENING FILE DIALOGS (For selecting server executables) ---
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

// --- OPENING FOLDER DIALOGS (For selecting working directories or log folders) ---
ipcMain.handle('select-folder', async () => {
    // mainWindow ensures the dialog is modal and centered
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
});

// --- OPEN FOLDER IN EXPLORER (For the "Open Folder" button in the UI) ---
ipcMain.on('open-folder', (event, srv) => {
    if (!srv) return;

    // Logic: 
    // 1. If we received an object with a workingDir, use that.
    // 2. Otherwise, if it's a string (old style), use the string.
    let targetPath = (typeof srv === 'object') ? (srv.workingDir || srv.path) : srv;

    try {
        if (fs.existsSync(targetPath)) {
            // If the path is a file (like the EXE), get its directory
            if (fs.lstatSync(targetPath).isFile()) {
                targetPath = path.dirname(targetPath);
            }
            shell.openPath(targetPath);
        } else {
            event.reply('system-error', `Folder does not exist: ${targetPath}`);
        }
    } catch (e) {
        event.reply('system-error', "Error accessing folder path.");
    }
});

// --- OPENING SERVER GUI (For servers that have a separate GUI launcher, like Space Engineers) ---
ipcMain.on('show-server-gui', (event, srv) => {
    // 1. Resolve the paths based on whether 'srv' is an object or a string
    let exePath = '';
    let instancePath = '';

    if (srv && typeof srv === 'object') {
        exePath = srv.path;
        instancePath = srv.logPath;
    } else {
        exePath = srv;
    }

    // 2. Validation to prevent the "type of string" error
    if (!exePath || typeof exePath !== 'string') {
        console.error(`[RSM] Cannot open GUI: Invalid path received.`);
        return;
    }

    const exeName = path.basename(exePath);
    const workingDir = path.dirname(exePath);

    // 3. Build the command
    let command = `start "" "${exeName}"`;

    // 4. Universal Adjustment: 
    // Only append -path if instancePath exists AND it looks like a Space Engineers executable.
    // This prevents sending "-path" to things like Minecraft or generic batch files.
    if (instancePath) {
        const isSE = exeName.toLowerCase().includes('spaceengineers');
        if (isSE) {
            command += ` -path "${instancePath}"`;
        }
        // If you add other games later, you can add 'else if' blocks here for their specific flags
    }

    // 5. Execution
    exec(command, { cwd: workingDir }, (err) => {
        if (err) {
            console.error(`[RSM] Failed to launch GUI: ${err}`);
            event.reply('system-info', `[RSM] Error launching GUI: ${err.message}`);
        } else {
            event.reply('system-info', `[RSM] Opening GUI for ${exeName}...`);
        }
    });
});

//      _   _ _____ _     ____  _____ ____  ____
//     | | | | ____| |   |  _ \| ____|  _ \/ ___|
//     | |_| |  _| | |   | |_) |  _| | |_) \___ \
//     |  _  | |___| |___|  __/| |___|  _ < ___) |
//     |_| |_|_____|_____|_|   |_____|_| \_\____/
//

// --- LOG TAILING FUNCTION (For servers that write to log files, like Space Engineers) ---
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

                    // 1. Decode
                    const incomingText = buffer.toString(selectedEncoding).replace(/\0/g, '');

                    if (DebugLogging) {
                        console.log(`[RSM-DEBUG] Captured ${bufferSize} bytes from ${srv.name}`);
                        // Shows first 50 chars of raw text to verify encoding success
                        console.log(`[RSM-DEBUG] Raw Preview: ${incomingText.substring(0, 50).replace(/\n/g, '\\n')}...`);
                    }

                    // 2. Filter
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

                    // 3. Format
                    const formattedOutput = cleanLines.map(line => {
                        return line.replace(/Thread:\s+\d+\s+->\s+/, '| ');
                    }).join('\n');

                    // 4. Dispatch
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

// --- COMMAND INJECTION LOGIC (For servers that support direct console input) ---
ipcMain.on('send-command', async (event, { srvId, command }) => {
    // 1. Find the active process info
    const processInfo = activeProcesses[srvId];
    if (!processInfo) {
        event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] Server is not active. Cannot send command.\n` });
        return;
    }

    // Find the server configuration (to check type/ports)
    const srv = managedServers.find(s => s.id === srvId);
    if (!srv) {
        DebugLog(`Command injection failed: No server config found for ID ${srvId}`);
        return;
    }
    DebugLog(`Preparing to send command to ${srv.name}: ${command}`);

    const serverCategory = findServType(srv);

    // --- Path A: Direct Input (Minecraft / Java / Vanilla+) ---
    if (serverCategory === 'DIRECT_CONSOLE') {
        DebugLog(`Attempting direct console injection for ${srv.name}...`);
        if (processInfo.shell && processInfo.shell.stdin.writable) {
            DebugLog(`Shell stdin is writable. Sending command: ${command}`);
            try {
                // We use \n to simulate hitting "Enter" in the console
                processInfo.shell.stdin.write(command + "\n");

                // Mirror the command to the UI so you see what you typed
                event.reply('console-out', { id: srvId, msg: `> ${command}\n` });
                DebugLog(`Command sent successfully to ${srv.name}: ${command}`);
            } catch (err) {
                event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] Stdin Write Failed: ${err.message}\n` });
                DebugLog(`Command injection failed for ${srv.name}: ${err.message}`);
            }
        }
    }
    // --- Path B: Space Engineers (Remote API Fallback) ---
    else if (srv.path.toLowerCase().includes('spaceengineers')) {
        DebugLog(`Attempting RSM API injection for ${srv.name}...`);
        const port = srv.apiPort || 8080;
        const password = srv.apiPass || "";
        const url = `http://localhost:${port}/vrageremote/v1/session`;
        DebugLog(`Attempting RSM API call to ${url} with command: ${command}`);

        try {
            const axios = require('axios');
            await axios.post(url,
                { "Command": `/${command.replace(/^\//, '')}` },
                {
                    headers: {
                        'Remote-Control-Http-Password': password,
                        'Content-Type': 'application/json'
                    }
                }
            );
            event.reply('console-out', { id: srvId, msg: `[RSM-API] Sent to port ${port}: ${command}\n` });
            DebugLog(`RSM API call successful for ${srv.name} on port ${port}`);

        } catch (err) {
            event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] SE API Call Failed: ${err.message}\n` });
            DebugLog(`RSM API call failed for ${srv.name} on port ${port}: ${err.message}`);
        }
    }
    else {
        event.reply('console-out', { id: srvId, msg: `[RSM-WARN] This server type does not support direct console input.\n` });
        DebugLog(`Command injection attempted for unsupported server type: ${srv.type}`);
    }
});

// ---SERVER TYPE HELPER FUNCTION---
function findServType(srv) {
    // Default to 'bridge' if no type is found, to stay safe
    const type = (srv.type || '').toLowerCase();
    DebugLog(`Determining server category for type: '${type}'`);

    switch (type) {
        case 'minecraft':
        case '7daystodie':
        case 'terraria':
            DebugLog(`Category assigned: DIRECT_CONSOLE, for type: '${type}'`);
            return 'DIRECT_CONSOLE'; // These use the direct Java/EXE pipe

        case 'spaceengineers':
        case 'starfield':
            DebugLog(`Category assigned: POWERSHELL_BRIDGE, for type: '${type}'`);
            return 'POWERSHELL_BRIDGE'; // These need the PID search and Log Tailing

        default:
            DebugLog(`Category assigned: DIRECT_CONSOLE, for type: '${type}' due to default case`);
            return 'DIRECT_CONSOLE'; // Default fallback
    }
}

// --- UNIVERSAL PROCESS SEARCH FUNCTION (Used for finding the actual game process when using the PowerShell bridge method) ---
function performSearch(parentPid, exeName, workingDir, finalizeCallback, event) {
    const { exec } = require('child_process');

    // STEP 1: Search by Parent-Child link using WMIC.
    // This is the cleanest way: looking for any process that was born from our PowerShell bridge.
    exec(`wmic process where ParentProcessId=${parentPid} get ProcessId,CommandLine`, (err, stdout) => {
        if (!err && stdout && stdout.trim().split('\n').length > 1) {
            const lines = stdout.trim().split('\n').slice(1);
            // We grab the last column which is usually the ProcessId
            const foundPid = parseInt(lines[0].trim().split(/\s+/).pop());

            if (!isNaN(foundPid) && foundPid !== 0) {
                DebugLog(`Deep Search: Found via Parent Link: ${foundPid}`);
                finalizeCallback(foundPid);
                return;
            }
        }

        // STEP 2: Universal Fallback using Tasklist.
        // If the Parent-Child link is broken (common with some game launchers), 
        // we look for an EXE name matching our server in the correct working directory.
        exec(`tasklist /V /FO CSV`, (err, stdout) => {
            if (err || !stdout) return;

            const lines = stdout.trim().split('\n');
            const searchExe = exeName.toLowerCase().replace(".exe", "");
            const searchDir = workingDir.toLowerCase().replace(/\\/g, '/');
            DebugLog(`Performing universal fallback search for EXE: '${searchExe}' in DIR: '${searchDir}'`);

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].toLowerCase().replace(/\\/g, '/');
                DebugLog(`Checking line: ${line}`);

                // We check if the line contains either the EXE name or the working directory
                if (line.includes(searchExe) || line.includes(searchDir)) {
                    const columns = lines[i].split('","').map(c => c.replace(/"/g, ''));
                    const foundPid = parseInt(columns[1]);
                    DebugLog(`Potential match found in tasklist: PID ${foundPid} | Line: ${line}`);

                    // Verify it's a valid PID and not just the PowerShell bridge itself
                    if (!isNaN(foundPid) && foundPid !== parentPid && foundPid !== 0) {
                        DebugLog(`Deep Search: Found via Universal Fallback: ${foundPid}`);
                        finalizeCallback(foundPid);
                        return;
                    }
                }
            }
        });
    });
}

function DebugLog(message) {
    if (DebugActive) console.log(`${debugPrefix} ${message}`);
}

function DebugConsoleLogs(message) {
    if (DebugLogging) console.log(`${debugPrefix} ${message}`);
}

function DebugCpuRam(message) {
    if (DebugCPURAM) console.log(`${debugPrefix} ${message}`);
}

setInterval(() => {
    DebugCpuRam(`Gathering total system performance data...`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        // 1. Calculate Total RAM %
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const ramPercent = Math.floor(((totalMem - freeMem) / totalMem) * 100);

        // 2. Calculate Total CPU %
        const cpus = os.cpus();
        let idle = 0, total = 0;
        cpus.forEach(cpu => {
            for (let type in cpu.times) total += cpu.times[type];
            idle += cpu.times.idle;
        });
        const cpuPercent = 100 - Math.floor((idle / total) * 100);

        // 3. Send to the NEW listener
        mainWindow.webContents.send('total-performance-update', {
            cpu: cpuPercent,
            ram: ramPercent
        });
        DebugCpuRam(`Broadcasted Total Performance: CPU ${cpuPercent}% | RAM ${ramPercent}%`); // This will show in the console every 2 seconds
    }
}, 2000);

// --- APP LIFECYCLE EVENTS ---
app.whenReady().then(() => {
    createWindow();
    createTray();

    // Give the UI 3 seconds to load before reporting re-linked processes
    setTimeout(syncActiveServers, 3000);
});

// --- Graceful Exit on macOS (When all windows are closed, we usually want to quit the app) ---
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- Ensure the app starts on login (This is also toggled by the UI, but we set it here by default) ---
app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe')
});

// --- Re-create the window if the dock icon is clicked and there are no other windows open (macOS behavior) ---
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});