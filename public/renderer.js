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

        const icon = getTypeIcon(s.type);

        item.innerHTML = `
            <div class="nav-content">
                <span class="status-dot ${s.status === 'Online' ? 'dot-online' : 'dot-offline'}"></span>
                <span class="type-icon" style="margin-right: 3px; opacity: 0.8;">${icon}</span>
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

// Gets icon of server type
const getTypeIcon = (type) => {
    switch (type) {
        case 'minecraft': return '⛏️';
        case 'space-engineers': return '🚀';
        // Add new types here
        default: return '🖥️'; // Generic server icon
    }
};

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
    const typeLabel = srv.type ? ` [${srv.type}]` : "";
    document.getElementById('active-name').innerText = srv.name + typeLabel;
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
    if (showGuiBtn) showGuiBtn.disabled = (srv.status === 'Online'); // Shows the GUI button only when the server is offline
}

/**
 * 4. GEAR MENU LOGIC 
 * Handles the dropdown menu (Edit, Delete, Open Folder)
 */
window.toggleSidebarMenu = (event, srvId) => {
    event.stopPropagation();

    // 1. Assign the global targetId for other functions to use
    targetId = srvId;

    // 2. Locate the buttons inside your static HTML dropdown
    // We can use querySelector to find the <a> tags by their order or text
    const menu = document.getElementById("options-dropdown");
    const links = menu.querySelectorAll('a');

    // 3. Manually bind the functions to these buttons for THIS specific server
    // Index 0: Edit | Index 1: Open Folder | Index 2: Delete (based on your HTML)
    if (links[0]) links[0].onclick = () => window.openEditModal(srvId);
    if (links[1]) links[1].onclick = () => window.openServerFolder(srvId);
    if (links[2]) links[2].onclick = () => window.deleteServer(srvId);

    // 4. Position and show the menu
    menu.style.top = `${event.clientY}px`;
    menu.style.left = `${event.clientX + 10}px`;
    menu.classList.add("show");

    console.log(`[RSM-DEBUG] Menu opened for server: ${srvId}`);
};

// Removes server from list (Requires server to be stopped first)
window.deleteServer = (id) => {
    // If no ID is passed, fall back to the global targetId
    const idToRemove = id || targetId;

    console.log(`[RSM-DEBUG] Delete server selected for ID ${idToRemove}`);

    if (confirm("Are you sure you want to delete this server?")) {
        servers = servers.filter(s => s.id.toString() !== idToRemove.toString());
        saveServers(); // Function to write to servers.json
        renderSidebar(); // Refresh the list
    }

    console.log(`[RSM-DEBUG] server with ID ${idToRemove} deleted`);
};

// Opens the Add Server modal but fills it with existing server data for editing
window.openEditModal = (serverId) => {
    console.log("[RSM-DEBUG] openEditModal triggered with ID:", serverId);

    if (!serverId) {
        console.error("[RSM-ERROR] No serverId passed to the function!");
        return;
    }

    // 1. Check if the server exists in your array
    const srv = servers.find(s => s.id.toString() === serverId.toString());

    if (!srv) {
        console.error("[RSM-ERROR] Could not find server in the list. Available IDs:", servers.map(s => s.id));
        return;
    }
    console.log("[RSM-DEBUG] Server found:", srv.name, "| Type:", srv.type);

    // 2. Set State
    window.editingServerId = srv.id;
    const type = srv.type || 'other';
    window.selectedType = type;
    console.log("[RSM-DEBUG] State set. editingServerId:", window.editingServerId, "type:", type);

    // 3. Setup Layout
    console.log("[RSM-DEBUG] Calling selectServerType...");
    if (typeof window.selectServerType === 'function') {
        window.selectServerType(type);
    } else {
        console.warn("[RSM-WARN] window.selectServerType is not defined!");
    }

    // 4. Fill Fields
    try {
        document.getElementById('newName').value = srv.name || "";
        document.getElementById('exePath').value = srv.path || "";
        //document.getElementById('processPriority').value = srv.priority || "32";

        const extraFields = ['customArgs', 'workingDir', 'logPath', 'mcRam', 'seInstance'];
        extraFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const dataKey = (id === 'customArgs') ? 'args' : id;
                el.value = srv[dataKey] || "";
            } else {
                console.log(`[RSM-DEBUG] Field '${id}' not found in DOM (this may be normal depending on server type)`);
            }
        });
        console.log("[RSM-DEBUG] All form fields populated.");
    } catch (err) {
        console.error("[RSM-ERROR] Failed to fill form fields:", err);
    }

    // 5. Display Logic
    const modalEl = document.getElementById('modal');
    if (modalEl) {
        console.log("[RSM-DEBUG] Modal element found. Setting display to flex...");
        modalEl.style.display = 'flex';

        if (typeof window.showWizardStep === 'function') {
            console.log("[RSM-DEBUG] Switching to Wizard Step 2...");
            window.showWizardStep(2);
        } else {
            console.error("[RSM-ERROR] window.showWizardStep is not a function!");
        }
    } else {
        console.error("[RSM-ERROR] CRITICAL: Element with ID 'modal' was not found in the HTML!");
    }
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
window.openServerFolder = (targetId) => { // Added targetId as a parameter
    if (!targetId) return;
    const srv = servers.find(s => s.id === targetId);
    if (!srv) return;

    // Logic: If there is a Working Directory saved, open that. 
    // Otherwise, open the folder where the executable lives.
    const folderToOpen = srv.workingDir || srv.path;

    ipcRenderer.send('open-folder', folderToOpen);
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
window.openModal = () => {
    document.getElementById('modal').style.display = 'flex';
};

window.openAddModal = () => {
    window.editingServerId = null; // Clear any old edit state
    window.selectedType = null;

    // Optional: Reset the form fields so old data doesn't stay there
    const form = document.querySelector('#wizard-step-2 form');
    if (form) form.reset();

    window.showWizardStep(1); // Start at the game selection cards
    window.openModal();
};

window.closeModal = () => {
    document.getElementById('modal').style.display = 'none';
    window.editingServerId = null;
    // Reset the wizard for next time
    window.showWizardStep(1);
};

// Logic to swap between Step 1 (Cards) and Step 2 (Form)
window.showWizardStep = (step) => {
    const s1 = document.getElementById('wizard-step-1');
    const s2 = document.getElementById('wizard-step-2');
    if (step === 1) {
        s1.style.display = 'block';
        s2.style.display = 'none';
    } else {
        s1.style.display = 'none';
        s2.style.display = 'block';
    }
};

// Triggered when a user clicks a "Type Card" (Minecraft, Space Engineers, etc.)
window.selectServerType = (type) => {
    window.selectedType = type;

    // 1. Hide ALL specific blocks first to start with a clean slate
    document.querySelectorAll('.platform-specific').forEach(b => {
        b.style.display = 'none'
    });

    // 2. Use Switch to decide what to show
    switch (type) {
        case 'minecraft':
            // Show only what Minecraft needs
            document.getElementById('path-label').innerText = "JAVA EXECUTABLE (javaw.exe)"; // Path for server starting application (i.e. java or server launcher)
            document.getElementById('path-block').style.display = 'block'; 
            document.getElementById('working-dir-block').style.display = 'block'; // Workiing directory or server location
            document.getElementById('args-block').style.display = 'block'; // custom args
            document.getElementById('log-block').style.display = 'none'; // Location of log files (mainly for servers like Space Engineers that need to tail the log file)

            // Examples (Placeholders)
            document.getElementById('newName').placeholder = "e.g. Minecraft Survival Hub";
            document.getElementById('exePath').placeholder = "C:\\Program Files\\Java\\...\\java.exe";
            document.getElementById('workingDir').placeholder = "C:\\Servers\\Minecraft_1.20";
            document.getElementById('customArgs').value = "-Xmx4G -Xms2G -jar server.jar nogui";
            break;

        case 'space-engineers':
            // Show only what SE needs
            document.getElementById('path-label').innerText = "SERVER EXECUTABLE (.exe)";
            document.getElementById('path-block').style.display = 'block';
            document.getElementById('working-dir-block').style.display = 'block';
            document.getElementById('args-block').style.display = 'block';
            document.getElementById('log-block').style.display = 'block';
            // SE might not need working dir override usually, so we keep it hidden

            // Examples (Placeholders)
            document.getElementById('newName').placeholder = "e.g. SE - Orion Sector";
            document.getElementById('exePath').placeholder = "...\\DedicatedServer64\\SpaceEngineersDedicated.exe";
            document.getElementById('workingDir').placeholder = "C:\ProgramData\SpaceEngineersDedicated\InstanceFolder";
            document.getElementById('logPath').placeholder = "same\as\instance\folder\normally";
            document.getElementById('customArgs').value = "-console -ignorelastsession -path 'path\to\instance folder' (in double quotes)";
            break;

        ///// ADD FUTURE GAME OPTIONS HERE WITH VARIABLES \\\\\

        case 'other':
            // Show everything for Generic
            document.querySelectorAll('.platform-specific').forEach(b => b.style.display = 'block');
            document.getElementById('path-label').innerText = "EXECUTABLE PATH";

            document.getElementById('customArgs').placeholder = "-flag1 -flag2 -config 'path/to/file"
            break;
    }

    window.showWizardStep(2);
};

// Back button on page 2
window.goBackToStep1 = () => {
    window.showWizardStep(1);
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
    // 1. Grab Basic Info
    const name = document.getElementById('newName').value;
    const path = document.getElementById('exePath').value;

    // Removed fr now until everything else works
    //const priority = document.getElementById('processPriority').value;

    // 2. Grab Type
    const type = window.selectedType || "other"; // Default to 'other' if null

    // 3. Grab Values Directly
    // Instead of checking if a checkbox is 'checked', we just grab the value.
    // If the box was hidden by the wizard, the value will naturally be empty/null.
    const args = document.getElementById('customArgs').value || "";
    const workingDir = document.getElementById('workingDir').value || "";
    const logPath = document.getElementById('logPath').value || "";

    // Minecraft/SE specific (using optional chaining ?. just in case the ID is missing)
    const mcRam = document.getElementById('mcRam')?.value || "";
    const seInstance = document.getElementById('seInstance')?.value || "";

    // 4. Validation
    if (!name || !path) return alert("Please provide a name and select an executable.");

    // 5. Save/Update Logic
    if (window.editingServerId) {
        const index = servers.findIndex(s => s.id === window.editingServerId);
        if (index !== -1) {
            servers[index] = {
                ...servers[index], // Keep ID, status, logs, pid
                name, path, args, logPath, workingDir, mcRam, seInstance // Removed priority for now until everything else works
                // We keep the original 'type' during edits
            };
            window.logToSystem(`Saving server ${name} with the following settings`);
            window.logToSystem(`Name: ${name}, Type: ${type} Path: ${path}, LogPath: ${logPath}, Working Directory: ${workingDir}, Args: ${args}`);
        }
    } else {
        servers.push({
            id: Date.now().toString(),
            name,
            path,
            type,
            mcRam,
            seInstance,
            args,
            logPath,
            workingDir,
            priority,
            status: 'Offline',
            logs: '',
            pid: null
        });
    }

    // 6. Persistence & UI
    ipcRenderer.send('save-servers', servers);
    renderSidebar();

    // 7. Full Cleanup
    // Clear every possible field so the next 'Add Server' starts fresh
    const fieldsToClear = ['newName', 'exePath', 'workingDir', 'customArgs', 'logPath', 'mcRam', 'seInstance'];
    fieldsToClear.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    window.selectedType = null;
    window.editingServerId = null; // Important: Clear the edit ID!
    window.logToSystem(`Saving server ${name} successful`);
    closeModal();
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

// Activate the input box
document.addEventListener('DOMContentLoaded', () => {
    const consoleInput = document.getElementById('console-input');
    if (consoleInput) {
        consoleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                window.sendConsoleCommand(e);
            }
        });
    }
});

ipcRenderer.on('system-error', (event, errorMsg) => window.logToSystem(`ERROR: ${errorMsg}`));
ipcRenderer.on('system-info', (event, infoMsg) => window.logToSystem(`INFO: ${infoMsg}`));