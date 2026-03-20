const { ipcRenderer } = require('electron');

// --- GLOBAL STATE ---
let servers = [];             // Stores all server objects (name, path, status, etc.)
let activeId = null;          // The ID of the server currently being viewed in the Dashboard
let targetId = null;          // The ID of the server targeted by the Gear icon menu
let draggedItemIndex = null;  // Used for reordering the sidebar list
const GAUGE_MAX = 157;        // The SVG stroke-dasharray value for a full circle gauge
const DEFAULT_ACCENT = '#007bff'; // Default Ronin Blue

/**
 * 1. INITIALIZATION 
 * Runs when the app first loads. Fetches data and sets the initial view.
 */
async function init() {
    // Fetch the list of servers from the main process (saved in servers.json)
    servers = await ipcRenderer.invoke('get-servers');

    if (!Array.isArray(servers)) servers = []; // Safety check in case of corrupted data

    initTheme();      // Apply saved user colors
    renderSidebar();  // Build the left-hand list
    showView('home'); // Start on the "home" (Resource Summary) screen

    // Load startup preferences from browser storage
    const startupPref = localStorage.getItem('launch-on-startup') === 'true';
    const startupChk = document.getElementById('launch-startup-chk');
    if (startupChk) startupChk.checked = startupPref;
}
init();

// Applies the saved accent color to the CSS --accent variable on startup
function initTheme() {
    // LOAD ACCENT COLOR
    const savedAccent = localStorage.getItem('preferred-accent') || DEFAULT_ACCENT;
    document.documentElement.style.setProperty('--accent', savedAccent);
    window.logToSystem(`Applied saved accent color: ${savedAccent}.`);

    // Sync Accent UI Elements
    const accPicker = document.getElementById('accent-picker');
    const accHex = document.getElementById('hex-display');
    if (accPicker) accPicker.value = savedAccent;
    if (accHex) accHex.innerText = savedAccent.toUpperCase();
    window.logToSystem("Synchronized accent color pickers and labels with saved preference.");

    // LOAD BACKGROUND COLOR
    const savedBg = localStorage.getItem('preferred-bg-color') || '#0f111a';
    // We use hexToRgb here because the CSS variable expects 3 numbers (R, G, B)
    document.documentElement.style.setProperty('--bg-color', hexToRgb(savedBg));
    window.logToSystem(`Applied saved background color: ${savedBg}.`);

    // Sync Background UI Elements
    const bgPicker = document.getElementById('bg-color-picker');
    const bgHex = document.getElementById('bg-hex-display');
    if (bgPicker) bgPicker.value = savedBg;
    if (bgHex) bgHex.innerText = savedBg.toUpperCase();
    window.logToSystem("Synchronized background color pickers and labels with saved preference.");

    // LOAD OPACITY (Transparency)
    const savedBgOp = localStorage.getItem('preferred-bg-opacity') || "1.0";
    document.documentElement.style.setProperty('--bg-opacity', savedBgOp);
    window.logToSystem(`Applied saved background opacity: ${savedBgOp}.`);

    // Sync Opacity UI Elements
    const opSlider = document.getElementById('bg-opacity-slider');
    const opLabel = document.getElementById('bg-opacity-label');
    if (opSlider) opSlider.value = savedBgOp;
    if (opLabel) opLabel.innerText = Math.round(savedBgOp * 100) + "%";
    window.logToSystem("Synchronized background opacity slider and label with saved preference.");

    // SYNC ACTIVE VISUAL STATE (The white border on squares)
    // Highlight Accent Grid
    const accentGrid = document.querySelector('.card:nth-child(2) .swatch-grid');
    if (accentGrid) updateActiveSwatches(accentGrid, savedAccent);
    window.logToSystem("Updated active state on accent color swatches.");

    // Highlight Background Grid
    const bgGrid = document.querySelector('.card:nth-child(3) .swatch-grid');
    if (bgGrid) updateActiveSwatches(bgGrid, savedBg);
    window.logToSystem("Updated active state on background color swatches.");

    // Load Text Color
    const savedText = localStorage.getItem('preferred-text-color') || '#ffffff';
    document.documentElement.style.setProperty('--text-color', hexToRgb(savedText));
    window.logToSystem(`Applied saved text color: ${savedText}.`);

    const textPicker = document.getElementById('text-color-picker');
    const textHex = document.getElementById('text-hex-display');
    if (textPicker) textPicker.value = savedText;
    if (textHex) textHex.innerText = savedText.toUpperCase();
    window.logToSystem("Synchronized text color pickers and labels with saved preference.");
}

// Asks the backend if we have Admin rights; displays the green badge if true
ipcRenderer.invoke('check-admin').then(isAdmin => {
    if (isAdmin) {
        document.getElementById('admin-badge').style.display = 'inline-block';
        console.log("[RSM] Running with Administrative privileges.");
        window.logToSystem("Running with Administrative privileges. You can manage servers that require elevated permissions.");
    } else {
        window.logToSystem("Running without Administrative privileges. Some servers may require elevation to start/stop properly.");
    }
});

/**
 * 2. VIEW MANAGEMENT 
 * Switches between the Home screen, the Manager (dashboard), and Settings.
 */
window.showView = (viewName) => {
    const views = {
        'home': document.getElementById('no-selection'),
        'manager': document.getElementById('manager-ui'),
        'settings': document.getElementById('settings-ui')
    };

    // Hide all views first to prevent overlap
    Object.values(views).forEach(v => {
        if (v) {
            // Using setProperty to ensure 'none' is enforced
            v.style.setProperty('display', 'none', 'important');
            v.style.pointerEvents = 'none';
        }
    });

    // Show the requested view
    const activeView = views[viewName];
    if (activeView) {
        // CRITICAL: Home needs 'flex' to keep the terminal and gauges visible
        const displayType = (viewName === 'home') ? 'flex' : 'block';
        activeView.style.setProperty('display', displayType, 'important');
        activeView.style.pointerEvents = 'auto';
        activeView.style.height = 'auto';
    }

    // If we leave the manager, deselect the active server
    if (viewName !== 'manager') {
        activeId = null;
        renderSidebar();
    }
};

/**
 * 3. SIDEBAR & DRAG-AND-DROP
 * Handles the list of servers on the left and reordering them.
 */
function renderSidebar() {
    const nav = document.getElementById('server-list');
    const menu = document.getElementById("options-dropdown");
    nav.innerHTML = "";

    if (menu) menu.classList.remove('show');

    if (servers.length === 0) {
        nav.innerHTML = '<div class="dim-text" style="padding:10px; font-size:12px;">No servers added...</div>';
        return;
    }

    servers.forEach((s, index) => {
        const item = document.createElement('div');
        // Apply 'active' class for the floating elevation effect we added earlier
        item.className = `nav-item ${activeId === s.id ? 'active' : ''}`;
        item.draggable = true;

        item.innerHTML = `
            <div class="nav-content">
                <span class="status-dot ${s.status === 'Online' ? 'dot-online' : 'dot-offline'}"></span>
                <span class="server-name">${s.name}</span>
            </div>
            <div class="item-options-gear" onclick="toggleSidebarMenu(event, '${s.id}')">
                ⚙️
            </div>
        `;

        // Drag and Drop logic for sorting the list
        item.addEventListener('dragstart', () => { draggedItemIndex = index; item.style.opacity = '0.4'; });
        item.addEventListener('dragend', () => item.style.opacity = '1');
        item.addEventListener('dragover', (e) => e.preventDefault());
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            handleSort(draggedItemIndex, index);
        });
        // Click logic: Select server unless the gear icon was clicked
        item.onclick = (e) => {
            if (!e.target.closest('.item-options-gear')) selectServer(s.id);
        };
        nav.appendChild(item);
    });
}

// Saves the new order of servers to the backend after a drag-drop
function handleSort(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const movedItem = servers.splice(fromIndex, 1)[0];
    servers.splice(toIndex, 0, movedItem);
    ipcRenderer.send('save-servers', servers);
    renderSidebar();
}

// Populates the Dashboard with the specific logs and info for the selected server
function selectServer(id) {
    activeId = id;
    const srv = servers.find(s => s.id === id);
    if (!srv) return;

    showView('manager');

    document.getElementById('active-name').innerText = srv.name;
    const consoleEl = document.getElementById('console');
    consoleEl.innerHTML = `<div>${srv.logs || "Console ready..."}</div>`; // Load existing logs into the console
    setTimeout(() => { // Delay to ensure logs are rendered before scrolling
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }, 10);
    consoleEl.scrollTop = consoleEl.scrollHeight; // Keep logs scrolled to bottom

    const statusEl = document.getElementById('active-status');
    statusEl.innerText = srv.status || 'Offline';
    statusEl.style.color = srv.status === 'Online' ? 'var(--success)' : 'var(--danger)';
    renderSidebar();

    const showGuiBtn = document.getElementById('show-gui-btn');
    if (showGuiBtn) showGuiBtn.disabled = (srv.status === 'Online');
}

/**
 * 4. GEAR MENU LOGIC 
 * Handles the dropdown menu (Edit, Delete, Open Folder)
 */
window.toggleSidebarMenu = (event, srvId) => {
    event.stopPropagation();
    targetId = srvId; // Remember which server we clicked the gear for
    const menu = document.getElementById("options-dropdown");
    menu.style.top = `${event.clientY}px`;
    menu.style.left = `${event.clientX + 10}px`;
    menu.classList.add("show");
};

// Removes server from list (Requires server to be stopped first)
window.deleteServer = () => {
    const idToDelete = targetId; // Use the targetId set by the gear menu click
    if (!idToDelete) return;
    const srv = servers.find(s => s.id === idToDelete);
    if (srv.status === 'Online') return alert("Stop the server before deleting.");

    if (confirm(`Delete "${srv.name}"?`)) { // Confirmation dialog to prevent accidents
        servers = servers.filter(s => s.id !== idToDelete);
        ipcRenderer.send('save-servers', servers);
        if (activeId === idToDelete) { activeId = null; showView('manager'); }
        renderSidebar();
    }
};

// Opens the Add Server modal but fills it with existing server data for editing
window.openEditModal = () => {
    if (!targetId) return;
    const srv = servers.find(s => s.id === targetId);
    if (!srv) return;

    // Standard Fields (Original)
    document.getElementById('newName').value = srv.name;
    document.getElementById('exePath').value = srv.path;
    document.getElementById('processPriority').value = srv.priority || "32";

    // Arguments Setup (Original)
    const hasArgs = !!(srv.args && srv.args.length > 0);
    document.getElementById('hasArgs').checked = hasArgs;
    document.getElementById('args-container').style.display = hasArgs ? 'block' : 'none';
    document.getElementById('customArgs').value = srv.args || "";

    // Log Path Setup
    // Checks if a logPath exists and toggles the UI accordingly
    const hasLog = !!(srv.logPath);
    document.getElementById('hasLogPath').checked = hasLog;
    document.getElementById('log-container').style.display = hasLog ? 'block' : 'none';
    document.getElementById('logPath').value = srv.logPath || "";

    // Finalize
    window.editingServerId = srv.id;
    openModal();
};

// Browses for the EXECUTABLE file
window.browse = async () => {
    const filePath = await ipcRenderer.invoke('open-dialog');
    if (filePath) {
        document.getElementById('exePath').value = filePath;
    }
};

// Browses for the LOG FOLDER
window.browseLogFolder = async () => {
    const folderPath = await ipcRenderer.invoke('select-folder');
    if (folderPath) {
        document.getElementById('logPath').value = folderPath;
    }
};

// Opens the Windows File Explorer to the server's directory (Original)
window.openServerFolder = () => {
    if (!targetId) return;
    const srv = servers.find(s => s.id === targetId);
    if (!srv) return;
    ipcRenderer.send('open-folder', srv.path);
};

window.browseWorkingFolder = async () => {
    // This matches your 'select-folder' handler in main.js
    const folderPath = await ipcRenderer.invoke('select-folder');
    if (folderPath) {
        document.getElementById('workingDir').value = folderPath;
    }
};

// Closes the gear menu if you click anywhere else
window.addEventListener('mousedown', (event) => {
    const menu = document.getElementById("options-dropdown");
    if (menu && !event.target.closest('.item-options-gear') && !event.target.closest('#options-dropdown')) {
        menu.classList.remove('show');
    }
});

/**
 * 5. SERVER CONTROLS 
 * Communicates with the backend to start/stop the actual .exe files
 */
window.startServer = () => {
    const srv = servers.find(s => s.id === activeId);
    if (srv && srv.status !== 'Online') {
        window.logToSystem(`Attempting to start server "${srv.name}"...`);
        srv.status = 'Online'; // Optimistic UI update
        renderSidebar();
        document.getElementById('crash-alert').style.display = 'none';
        ipcRenderer.send('start-server', srv);
    }
};

window.stopServer = () => {
    // Look up the server object using the currently active ID in the UI
    const srv = servers.find(s => s.id === activeId);

    if (srv) {
        // We check status or ID instead of just PID, 
        // because the backend might know the PID even if the frontend hasn't updated yet.
        window.logToSystem(`Attempting to stop server "${srv.name}"...`);

        // IMPORTANT: Send the srv.id, not the srv.pid
        ipcRenderer.send('stop-server', srv.id);
    } else {
        console.error("[RSM] Stop failed: No active server selected or found.");
    }
};

// Forcefully kills the process tree (Used if the server hangs)
window.killServer = () => {
    const srv = servers.find(s => s.id === activeId);
    if (srv && srv.pid) {
        if (confirm(`FORCE KILL "${srv.name}"?`)) {
            window.logToSystem(`Force killing server "${srv.name}"...`);
            ipcRenderer.send('kill-server', srv.pid);
        }
    }
};

/**
 * CONSOLE COMMAND INPUT
 * Captures text from the input box and sends it to the active server.
 */
window.sendConsoleCommand = (event) => {
    // Only trigger if the user presses 'Enter'
    if (event.key === 'Enter') {
        const inputEl = document.getElementById('console-input');
        const command = inputEl.value.trim();

        if (command && activeId) {
            // Find the server object to log it locally first
            const srv = servers.find(s => s.id === activeId);

            // Send the command to the Main process
            ipcRenderer.send('send-command', {
                srvId: activeId,
                command: command
            });

            // Clear the input for the next command
            inputEl.value = '';

            window.logToSystem(`Command sent to ${srv.name}: ${command}`);
        }
    }
};

/**
 *  6.
 * Updates the global accent color and handles UI highlights.
 */

// Updates buttons, gauges, and glow effects.
window.updateAccent = (color) => {
    document.documentElement.style.setProperty('--accent', color);
    localStorage.setItem('preferred-accent', color);

    if (document.getElementById('accent-wrapper')) document.getElementById('accent-wrapper').style.backgroundColor = color;
    // Update the hex label and the custom picker input
    if (document.getElementById('hex-display')) document.getElementById('hex-display').innerText = color.toUpperCase();
    if (document.getElementById('accent-picker')) document.getElementById('accent-picker').value = color;

    // Only highlight swatches inside the first card (Accent section)
    const accentGrid = document.querySelector('.card:nth-child(2) .swatch-grid');
    updateActiveSwatches(accentGrid, color);
};

//* Updates the main window color.
window.updateBgColor = (hex) => {
    const rgb = hexToRgb(hex);
    document.documentElement.style.setProperty('--bg-color', rgb);
    localStorage.setItem('preferred-bg-color', hex);
    if (document.getElementById('bg-wrapper')) document.getElementById('bg-wrapper').style.backgroundColor = hex;

    // Update background-specific UI elements
    if (document.getElementById('bg-hex-display')) document.getElementById('bg-hex-display').innerText = hex.toUpperCase();
    if (document.getElementById('bg-color-picker')) document.getElementById('bg-color-picker').value = hex;

    // Highlight swatches inside the background card section
    const bgGrid = document.querySelector('.card:nth-child(3) .swatch-grid');
    updateActiveSwatches(bgGrid, hex);
};


// Updates the 'active' white border/glow on swatches
function updateActiveSwatches(container, color) {
    if (!container) return;
    container.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.classList.remove('active');
        if (swatch.style.backgroundColor && rgbToHex(swatch.style.backgroundColor) === color.toLowerCase()) {
            swatch.classList.add('active');
        }
    });
}

// Updates color for text
function updateTextColor(hex) {
    // Convert hex to the comma-separated string (e.g., "255, 255, 255")
    const rgb = hexToRgb(hex);

    // Update the CSS variable immediately
    document.documentElement.style.setProperty('--text-color', rgb);
    if (document.getElementById('text-wrapper')) document.getElementById('text-wrapper').style.backgroundColor = hex;

    // Only update the text label if it exists on the current page
    const hexDisplay = document.getElementById('text-hex-display');
    if (hexDisplay) {
        hexDisplay.innerText = hex.toUpperCase();
    }

    // Save to permanent storage
    localStorage.setItem('preferred-text-color', hex);
}

window.updateOpacity = (type, value) => {
    if (type === 'bg') {
        // 1. Apply to CSS Variable
        document.documentElement.style.setProperty('--bg-opacity', value);

        // 2. Update the % label
        const label = document.getElementById('bg-opacity-label');
        if (label) label.innerText = Math.round(value * 100) + "%";

        // 3. Save to LocalStorage
        localStorage.setItem('preferred-bg-opacity', value);

        window.logToSystem(`Opacity adjusted to ${Math.round(value * 100)}%`);
    }
};

// Hex to RGB (Needed for CSS rgba variables)
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
}

// RGB String to Hex (Needed for swatch comparison)
function rgbToHex(rgb) {
    if (!rgb) return "";
    let a = rgb.split("(")[1].split(")")[0].split(",");
    return "#" + a.map(x => {
        x = parseInt(x).toString(16);
        return (x.length == 1) ? "0" + x : x;
    }).join("");
}

// --- THEME PRESET LOGIC ---

// Preset 1: Internal Fire
window.applyFireTheme = () => {
    window.logToSystem(`Applying "Internal Fire" theme preset with Accent: #ff4500, Background: #0a0a0a, Text: #ffffff.`);
    applyPreset({ accent: "#ff4500", bg: "#0a0a0a", text: "#ffffff" }, "Internal Fire");
};

// Preset 2: Ronin Classic
window.applyDefaultTheme = () => {
    applyPreset({ accent: "#007bff", bg: "#0f111a", text: "#ffffff" }, "Ronin Classic");
    window.logToSystem(`Applying "Ronin Classic" theme preset with Accent: #007bff, Background: #0f111a, Text: #ffffff.`);
};

// The "Master" Function that does the work
function applyPreset(theme, name) {
    // Call your existing theme handlers (Ensures CSS + LocalStorage update)
    if (window.updateAccent) window.updateAccent(theme.accent);
    if (window.updateBgColor) window.updateBgColor(theme.bg);
    if (window.updateTextColor) window.updateTextColor(theme.text);
    window.logToSystem(`Applying theme preset: "${name}" with Accent: ${theme.accent}, Background: ${theme.bg}, Text: ${theme.text}.`);
   
    // Sync the actual color picker inputs so they don't stay the old color
    const pickerMap = {
        'accent-picker': theme.accent,
        'bg-color-picker': theme.bg,
        'text-color-picker': theme.text
    };
    window.logToSystem(`Updating color pickers to match the new theme preset values.`);

    for (const [id, value] of Object.entries(pickerMap)) {
        const input = document.getElementById(id);
        if (input) input.value = value;
    }

    // Log to your cool new boot console
    if (window.logToSystem) {
        window.logToSystem(`[Theme] Preset "${name}" applied.`);
    }
}

/**
 * 7. IPC LISTENERS 
 * Listens for messages coming BACK from the main process
 */

// Appends new text from the server's console to the UI
ipcRenderer.on('console-out', (event, data) => {
    const srv = servers.find(s => s.id === data.id);
    if (srv) srv.logs += data.msg;
    if (activeId === data.id) {
        const c = document.getElementById('console');
        if (c) {
            // Using a div wrapper prevents the text from "stretching" the container
            const logLine = document.createElement('div');
            logLine.style.whiteSpace = 'pre-wrap';
            logLine.textContent = data.msg;
            c.appendChild(logLine);

            // AUTO-SCROLL FIX
            c.scrollTop = c.scrollHeight;

            // PERFORMANCE FIX: Keep only last 1500 lines
            if (c.childNodes.length > 1500) {
                c.removeChild(c.firstChild);
            }
        }
    }
});

// Updates the UI when a server starts, stops, or crashes
ipcRenderer.on('status-change', (event, data) => {
    const srv = servers.find(s => s.id === data.id);
    if (srv) {
        srv.status = data.status;
        srv.pid = data.pid || null;
        window.logToSystem(`Server "${srv.name}" is now ${data.status}.`);
        renderSidebar();
    }

    if (activeId === data.id) {
        const showGuiBtn = document.getElementById('show-gui-btn');

        if (data.status === 'Online') {
            document.getElementById('crash-alert').style.display = 'none';
            if (showGuiBtn) showGuiBtn.disabled = false;
        } else {
            if (showGuiBtn) showGuiBtn.disabled = true;
        }
        selectServer(activeId);

        // Auto-restart logic if a crash is detected
        if (data.crash) {
            document.getElementById('crash-alert').style.display = 'block';
            document.getElementById('crash-msg').innerText = `Crash at ${data.crash.time}`;
            window.logToSystem(`Server "${srv.name}" crashed at ${data.crash.time}.`);

            // Check if auto-restart is enabled in settings and attempt to restart after a delay
            if (document.getElementById('auto-restart-chk').checked) {
                window.logToSystem(`Auto-restart is enabled. Attempting to restart "${srv.name}" in 5 seconds...`);
                setTimeout(window.startServer, 5000);
            }
        }
    }
});

// Receives CPU/RAM data every 2 seconds and updates the circular gauges
ipcRenderer.on('global-stats', (event, procList) => {
    let totalCPU = 0;
    let totalRAM = 0;
    const summaryList = document.getElementById('status-summary-list');
    const isHome = document.getElementById('no-selection').style.display === 'flex';

    if (isHome && summaryList) summaryList.innerHTML = "";

    servers.forEach(srv => {
        const proc = procList.find(p => p.pid === srv.pid);
        if (proc) {
            totalCPU += proc.cpu;
            totalRAM += (proc.memRss / 1024); // Convert KB to MB
        }

        // If on home screen, rebuild the quick-status list
        if (isHome && summaryList) {
            const row = document.createElement('div');
            row.className = 'status-summary-row';
            const statusClass = srv.status === 'Online' ? 'pill-online' : 'pill-offline';
            row.innerHTML = `<span>${srv.name}</span><span class="pill ${statusClass}">${srv.status}</span>`;
            summaryList.appendChild(row);
        }
    });

    if (isHome) {
        // Update home screen total gauges
        updateGauge('total-cpu', totalCPU);
        updateGauge('total-ram', (totalRAM / 16384) * 100, totalRAM.toFixed(0) + " MB"); // Assuming 16GB max for gauge scale
    } else {
        // Update individual server gauges
        const srv = servers.find(s => s.id === activeId);
        const proc = (srv && srv.pid) ? procList.find(p => p.pid === srv.pid) : null;
        if (proc) {
            updateGauge('cpu', proc.cpu);
            updateGauge('ram', (proc.memRss / 1024 / 8192) * 100, (proc.memRss / 1024).toFixed(0) + " MB");
        } else {
            updateGauge('cpu', 0, "0.0%");
            updateGauge('ram', 0, "0 MB");
        }
    }
});

/**
 * 8. UI HELPERS
 * Handles Gauges, Modals, and File Browsing
 */
function updateGauge(type, percent, label) {
    const el = document.getElementById(`${type}-gauge`);
    const valEl = document.getElementById(`${type}-val`) || document.getElementById(type);

    if (!el) return;

    const val = Math.min(Math.max(percent, 0), 100);
    const offset = GAUGE_MAX - (val / 100 * GAUGE_MAX); // Calculate stroke-dashoffset

    el.style.strokeDashoffset = offset;
    if (valEl) valEl.innerText = label || val.toFixed(1) + "%";
}

// Modal Toggle
window.openModal = () => document.getElementById('modal').style.display = 'flex';
window.closeModal = () => {
    document.getElementById('modal').style.display = 'none';
    window.editingServerId = null;
};

// Opens the server's custom GUI if available (Some games have a separate .exe for the GUI, this sends the path to the backend to open it)
function showServerGUI() {
    const server = servers.find(s => s.id === activeId);

    if (server && server.path) {
        window.logToSystem(`Opening GUI for ${server.name} with custom instance path...`);
        // CHANGE: Send the whole 'server' object instead of just 'server.path'
        ipcRenderer.send('show-server-gui', server);
    }
}

// Adds a new server or updates an existing one in the list
window.saveNewServer = () => {
    const name = document.getElementById('newName').value;
    const path = document.getElementById('exePath').value;
    const priority = document.getElementById('processPriority').value;

    // Arguments Logic
    const hasArgs = document.getElementById('hasArgs').checked;
    const args = hasArgs ? document.getElementById('customArgs').value : "";

    // Log Path Logic
    const hasLog = document.getElementById('hasLogPath').checked;
    const logPath = hasLog ? document.getElementById('logPath').value : null;

    // NEW: Working Directory Logic
    const hasWorkingDir = document.getElementById('hasWorkingDir').checked;
    const workingDir = hasWorkingDir ? document.getElementById('workingDir').value : null;

    const action = window.editingServerId ? "Updated" : "Created new";

    if (!name || !path) return alert("Please provide a name and select an executable.");

    if (window.editingServerId) {
        const index = servers.findIndex(s => s.id === window.editingServerId);
        if (index !== -1) {
            // Update existing
            servers[index] = {
                ...servers[index],
                name,
                path,
                args,
                logPath,
                workingDir, // Save workingDir
                priority
            };
        }
    } else {
        // Create new
        servers.push({
            id: Date.now().toString(),
            name,
            path,
            args,
            logPath,
            workingDir, // Save workingDir
            priority,
            status: 'Offline',
            logs: '',
            pid: null
        });
    }

    // Updated system log to include Working Directory status
    window.logToSystem(`${action} configuration for "${name}". Log Tailing: ${hasLog ? 'Enabled' : 'Disabled'}. Custom Dir: ${hasWorkingDir ? 'Yes' : 'No'}`);

    ipcRenderer.send('save-servers', servers);
    renderSidebar();
    closeModal();
    showView('home');
};

// Internal Log System for Manager Errors/Info
window.logToSystem = (msg) => {
    const homeConsole = document.getElementById('system-console');
    if (!homeConsole) return;

    const time = new Date().toLocaleTimeString([], { hour12: false });

    // Create a physical element instead of using innerHTML += (which is slow)
    const logEntry = document.createElement('div');
    logEntry.style.cssText = "text-align: left; margin-bottom: 2px; width: 100%;";
    logEntry.innerHTML = `
        <span style="color: var(--dim);">[${time}]</span> 
        <span style="color: var(--accent);">[System/INFO]:</span> 
        <span>${msg}</span>`;

    homeConsole.appendChild(logEntry);

    // AUTO-SCROLL FIX
    homeConsole.scrollTop = homeConsole.scrollHeight;

    // PERFORMANCE FIX: Prevent memory leaks on the home screen
    if (homeConsole.childNodes.length > 500) {
        homeConsole.removeChild(homeConsole.firstChild);
    }
};

ipcRenderer.on('system-error', (event, errorMsg) => window.logToSystem(`ERROR: ${errorMsg}`));
ipcRenderer.on('system-info', (event, infoMsg) => window.logToSystem(`INFO: ${infoMsg}`));