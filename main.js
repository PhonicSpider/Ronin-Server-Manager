const { app, BrowserWindow, shell, ipcMain, dialog, Tray, Menu, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec, execSync } = require('child_process');
const si = require('systeminformation');
let mainWindow;
let tray = null;
const activeProcesses = {};
const DATA_FILE = path.join(app.getPath('userData'), 'servers.json');
const DebugActive = true; // Set to false to disable debug logs in the console

// --- 1. Data Persistence ---
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

// --- 2. Window & Tray Management ---
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

// --- 3. Startup Sync (Detect Already Running Servers) ---
function syncActiveServers() {
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

// --- 4. IPC Handlers ---

// Check if the app is running as Administrator (No loop risk here)
ipcMain.handle('check-admin', async () => {
    return new Promise((resolve) => {
        exec('net session', (err) => {
            resolve(!err); // If no error, we are admin
        });
    });
});

ipcMain.handle('get-servers', () => managedServers);

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

ipcMain.on('update-startup-settings', (event, isEnabled) => {
    app.setLoginItemSettings({
        openAtLogin: isEnabled,
        path: app.getPath('exe') // Points to your app's location
    });
    console.log(`[RSM] Launch on startup set to: ${isEnabled}`);
});

// Checks for server files (Keep 'open-dialog' name to match your existing renderer call)
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

// Looking for log folders
ipcMain.handle('select-folder', async () => {
    // mainWindow ensures the dialog is modal and centered
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
});

// Launch Process
ipcMain.on('start-server', (event, srv) => {
    event.reply('system-info', `[RSM] getting information for server: ${srv.name}`);

    // This is the "Compatibility Bridge"
    // If a server (like Minecraft) needs a specific folder, it uses it.
    // If it's a standard EXE (like SE), it just uses the EXE's folder.
    const workingDir = srv.workingDir || path.dirname(srv.path);
    const exeName = path.basename(srv.path);

    const argArray = srv.args ? srv.args.split(' ').filter(a => a.trim() !== "") : []; // Split the arguments into an array, filtering out any empty strings
    const argString = argArray.join(' '); // Join the arguments back into a single string for PowerShell, ensuring we handle any extra spaces correctly
    const psArgs = argString.replace(/'/g, "''"); // Escape single quotes for PowerShell by doubling them

    if (DebugActive) {
        event.reply('system-info', `[RSM-DEBUG] Path: ${srv.path}`);
        event.reply('system-info', `[RSM-DEBUG] Args: ${psArgs}`);
        event.reply('system-info', `[RSM-DEBUG] CWD: ${workingDir}`);
    }

    // --- Replace your current 'const child = spawn(...)' with this ---
    const isMinecraft = srv.type && srv.type.toLowerCase() === 'minecraft';
    const isSpaceEngineers = srv.type && srv.type.toLowerCase() === 'spaceengineers';
    let child;

    if (isMinecraft) {
        // Start Minecraft directly so Electron can "see" the text stream
        // Note: ensure srv.path is the actual path to the server .jar
        child = spawn('java', ['-jar', srv.path, ...argArray], {
            cwd: workingDir,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
    } else if (isSpaceEngineers) {
        // Space Engineers needs the PowerShell bridge to return a PID
        child = spawn('powershell.exe', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
            `$p = Start-Process -FilePath '${srv.path}' -ArgumentList '${psArgs}' -WorkingDirectory '${workingDir}' -WindowStyle normal -PassThru; 
        Write-Output "PID_MARKER:$($p.Id)"; 
        $p.WaitForExit();`
        ], {
            cwd: workingDir, shell: true, stdio: ['pipe', 'pipe', 'pipe']
        });
    } else {
        // Generic Fallback: Useful for simple .exe servers (like Valheim or Terraria)
        child = spawn(`"${srv.path}"`, argArray, {
            cwd: workingDir,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
    }

    let actualGamePid = 0;
    let logWatcher = null;
    let monitorInterval = null;
    let isHandingOff = true;
    let searchRetry = null; // We define this here so we can clear it later if needed.

    // This is called only after we have the real PID
    const startLogging = (logFolderPath) => {
        if (logWatcher) clearInterval(logWatcher);

        try {
            const getNewestLog = () => {
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
            if (newestLog) {
                event.reply('system-info', `[RSM] Tailing: ${path.basename(newestLog)}`);

                let lastSize = fs.statSync(newestLog).size;

                logWatcher = setInterval(() => {
                    try {
                        const stats = fs.statSync(newestLog);
                        if (stats.size > lastSize) {
                            const fd = fs.openSync(newestLog, 'r');
                            const bufferSize = stats.size - lastSize;
                            const buffer = Buffer.alloc(bufferSize);

                            fs.readSync(fd, buffer, 0, bufferSize, lastSize);
                            fs.closeSync(fd);

                            const incomingText = buffer.toString();

                            // 1. Split into lines and filter out SE telemetry noise
                            const cleanLines = incomingText.split(/\r?\n/).filter(line => {
                                const lower = line.toLowerCase();
                                return !lower.includes('->  statistics') &&
                                    !lower.includes('->  memory legend') &&
                                    !lower.includes('->  memory values') &&
                                    !lower.includes('->  Thread:');
                            });

                            const cleanOutput = cleanLines.join('\n');

                            // 2. Only send to UI if there is meaningful content left
                            if (cleanOutput.trim().length > 0) {
                                event.reply('console-out', { id: srv.id, msg: cleanOutput + '\n' });
                            }

                            lastSize = stats.size;
                        }
                    } catch (e) {
                        // Log might be locked, skip and try next interval
                    }
                }, 1000);
            }
        } catch (err) {
            event.reply('system-info', `[RSM-DEBUG] Log Discovery Error: ${err.message}`);
        }
    };

    // 2. Standard Console Listeners
    child.stdout.on('data', (data) => {
        const msg = data.toString();
        // Minecraft will send its logs here! 
        // We reply so the UI sees it instantly.
        event.reply('console-out', { id: srv.id, msg: msg });

        if (msg.includes('PID_MARKER:')) {
            isHandingOff = true;
        }
    });

    child.stderr.on('data', (data) => {
        event.reply('console-out', { id: srv.id, msg: data.toString() });
    });

    child.on('error', (err) => {
        event.reply('system-error', `Failed to spawn ${srv.name}: ${err.message}`);
    });

    // handler for sending commands to active servers
    // --- Updated Console Command Handler ---
    ipcMain.on('send-command', async (event, { srvId, command }) => {
        // 1. Find the active process info
        const procInfo = activeProcesses[srvId];
        if (!procInfo) {
            event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] Server is not active. Cannot send command.\n` });
            return;
        }

        const srv = managedServers.find(s => s.id === srvId);
        if (!srv) return;

        // --- Path A: Minecraft / Java / Standard Input ---
        // If we have a writable shell (captured during start-server)
        if (procInfo.shell && procInfo.shell.stdin.writable) {
            try {
                // We use \n for Minecraft/Java to simulate hitting "Enter"
                procInfo.shell.stdin.write(command + "\n");

                // Mirror the command to the UI console so the user sees what they typed
                event.reply('console-out', { id: srvId, msg: `> ${command}\n` });
            } catch (err) {
                event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] Stdin Write Failed: ${err.message}\n` });
            }
        }

        // --- Path B: Space Engineers (Remote API Fallback) ---
        else if (srv.path.toLowerCase().includes('spaceengineers')) {
            const port = srv.apiPort || 8080;
            const password = srv.apiPass || "";
            const url = `http://localhost:${port}/vrageremote/v1/session`;

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
            } catch (err) {
                event.reply('console-out', { id: srvId, msg: `[RSM-ERROR] SE API Call Failed: ${err.message}\n` });
            }
        }
        else {
            event.reply('console-out', { id: srvId, msg: `[RSM-WARN] This server type does not support direct console input yet.\n` });
        }
    });

    // 4. Search: Parent-Child + Universal Fallback
    setTimeout(() => {
        if (!child.pid) return;

        // Define the heartbeat so it knows which server to monitor
        const startHeartbeat = (pid) => {
            if (monitorInterval) clearInterval(monitorInterval);

            monitorInterval = setInterval(() => {
                // Check if the process ID still exists in Windows
                exec(`tasklist /fi "PID eq ${pid}"`, (err, stdout) => {
                    const isAlive = stdout && stdout.includes(pid.toString());

                    if (!isAlive) {
                        event.reply('system-info', `[RSM] Heartbeat lost for PID ${pid}. Cleaning up...`);
                        stopServerCleanup(); // Call our cleanup function
                    } else {
                        // Optional: Keep status as Online
                        event.reply('status-change', { id: srv.id, status: 'Online' });
                    }
                });
            }, 120000); // Check every 120 seconds. (1000ms = 1s, so 30000ms = 30 seconds))
            // This is a "heartbeat" to ensure we catch unexpected closures even if the launcher shell is still open.
            // Adjust as needed. Can go higher for loonger times between checks, but 30s is a good balance for responsiveness without being too aggressive.
        };

        const finalizeProcess = (pid) => {
            if (searchRetry) {
                clearInterval(searchRetry); // Stop the search loop immediately)
                searchRetry = null;
            }

            actualGamePid = pid; // This is the PID we will monitor for the lifecycle of this server session.
            activeProcesses[srv.id] = {
                pid: pid,
                shell: child, // This allows stdin.write() to work later
                status: 'Online'
            };

            event.reply('system-info', `[RSM-DEBUG] Finalizing Process: PID ${pid} assigned to Server ${srv.id}`);

            startHeartbeat(pid);
            if (srv.logPath && fs.existsSync(srv.logPath)) {
                startLogging(srv.logPath);
            }
        };

        if (isMinecraft || (!isMinecraft && !isSpaceEngineers)) {
            // If it's Minecraft or Generic, don't search. Just use the PID we already have.
            event.reply('system-info', `[RSM] Direct process detected. Finalizing PID: ${child.pid}`);
            finalizeProcess(child.pid);
            return; // This "return" is important; it skips the SE search logic below.
        }
        else {
            const performSearch = () => {
                // STEP 1: Try the direct approach (Search by Parent ID)
                exec(`wmic process where ParentProcessId=${child.pid} get ProcessId,CommandLine`, (err, stdout) => {
                    if (!err && stdout && stdout.trim().split('\n').length > 1) {
                        const lines = stdout.trim().split('\n').slice(1);
                        const parts = lines[0].trim().split(/\s+/);
                        const foundPid = parseInt(parts[parts.length - 1]);

                        if (!isNaN(foundPid)) {
                            event.reply('system-info', `[RSM] Found via Parent-Child link: ${foundPid}`);
                            finalizeProcess(foundPid);
                            return;
                        }
                    }

                    // STEP 2: Fallback to Tasklist CSV (Universal Path & Argument Matching)
                    exec(`tasklist /V /FO CSV`, (err, stdout) => {
                        if (err || !stdout) return;

                        const lines = stdout.trim().split('\n');

                        // Normalize our specific server info for comparison
                        const searchExe = exeName.toLowerCase().replace(".exe", "");
                        const searchPath = srv.path.toLowerCase().replace(/\\/g, '/');
                        const searchDir = workingDir.toLowerCase().replace(/\\/g, '/');

                        for (let i = 1; i < lines.length; i++) { // Skip CSV header
                            const line = lines[i].toLowerCase().replace(/\\/g, '/');

                            // UNIVERSAL MATCH: 
                            // We look for the EXE name OR the folder path inside the task info
                            if (line.includes(searchExe) || line.includes(searchDir)) {
                                // CSV format: "Image Name","PID","Session Name","Session#","Mem Usage","Status","User Name","CPU Time","Window Title"
                                const columns = lines[i].split('","').map(c => c.replace(/"/g, ''));
                                const foundPid = parseInt(columns[1]);

                                if (!isNaN(foundPid) && foundPid !== 0) {
                                    // Double check: Don't accidentally "find" our own launcher shell
                                    if (foundPid !== child.pid) {
                                        event.reply('system-info', `[RSM] Universal Handover Successful! PID: ${foundPid}`);
                                        finalizeProcess(foundPid);
                                        return;
                                    }
                                }
                            }
                        }

                        event.reply('system-info', `[RSM-DEBUG] Deep Scan still searching for ${searchExe}...`);
                    });
                });
            };

            // Run the search every 3 seconds during the boot window
            searchRetry = setInterval(() => {
                if (actualGamePid === 0) performSearch();
                else clearInterval(searchRetry);
            }, 3000);
        }

        setTimeout(() => clearInterval(searchRetry), 30000);
    }, 2000);

    function stopServerCleanup() {
        if (monitorInterval) clearInterval(monitorInterval);
        monitorInterval = null;

        if (logWatcher) {
            if (typeof logWatcher.close === 'function') logWatcher.close();
            else clearInterval(logWatcher);
            logWatcher = null;
        }

        delete activeProcesses[srv.id];
        event.reply('status-change', { id: srv.id, status: 'Offline' });
    }

    // 5. Cleanup on Close
    child.on('close', (code) => {
        event.reply('system-info', `[RSM] Launcher shell finished (Code: ${code}). Searching for game process...`);

        // Wait 7 seconds. This gives the 'searchRetry' interval (which runs every 3s)
        // enough time to finish at least two more loops before we declare it dead.
        setTimeout(() => {
            const processFound = (actualGamePid !== 0);
            const isRegistered = activeProcesses[srv.id] !== undefined;

            if (processFound || isRegistered) {
                event.reply('system-info', `[RSM-SUCCESS] Handover confirmed for PID ${actualGamePid}. Monitoring continues.`);
                return; // Exit here! Do NOT run the offline cleanup.
            }

            // If we reach here, the launcher closed AND the search found nothing.
            event.reply('system-info', `[RSM-DEBUG] Handover failed. actualGamePid: ${actualGamePid}, Code: ${code}`);

            if (logWatcher) {
                if (typeof logWatcher.close === 'function') {
                    logWatcher.close();
                } else {
                    clearInterval(logWatcher);
                }
            }

            delete activeProcesses[srv.id];

            let crashData = (code !== 0 && code !== null) ? { time: new Date().toLocaleTimeString(), code: code } : null;
            event.reply('system-info', `[RSM] Server process exited early or failed to launch (Code: ${code})`);
            event.reply('status-change', { id: srv.id, status: 'Offline', crash: crashData });

        }, 8000); // 8-second delay to catch the "Super Search" result
    });
});

ipcMain.on('stop-server', (event, srvId) => {
    // 1. Initial Logging
    console.log(`[RSM-DEBUG] Received stop-server request for ID: ${srvId}`);
    event.reply('system-info', `[RSM] Stop signal received for: ${srvId}`);

    // 2. Robust Lookup
    let procInfo = activeProcesses[srvId] || activeProcesses[srvId.toString()];
    if (!procInfo) {
        const foundKey = Object.keys(activeProcesses).find(key =>
            activeProcesses[key].pid.toString() === srvId.toString()
        );
        if (foundKey) procInfo = activeProcesses[foundKey];
    }

    if (!procInfo || !procInfo.pid) {
        event.reply('system-info', `[RSM-WARN] Stop failed: No active process found for ${srvId}`);
        return;
    }

    const { pid, shell } = procInfo;
    event.reply('system-info', `[RSM] Identifying PID ${pid}. Sending graceful shutdown sequence...`);

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

// --- 5. Monitoring & Lifecycle ---
setInterval(async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        const pidsToTrack = Object.values(activeProcesses).map(proc => proc.pid);

        si.processes().then(data => {
            const list = data.list.filter(p => pidsToTrack.includes(p.pid));
            mainWindow.webContents.send('global-stats', list);
        });
    }
}, 2000); // We use a longer interval here (2 seconds) to reduce overhead, as process scanning can be intensive.

// --- 6. Final App Initialization ---
app.whenReady().then(() => {
    createWindow();
    createTray();

    // Give the UI 3 seconds to load before reporting re-linked processes
    setTimeout(syncActiveServers, 3000);
});

// Quit when all windows are closed, unless we're on macOS
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Handle "Run at Startup"
app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe')
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});