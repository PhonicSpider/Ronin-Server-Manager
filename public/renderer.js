import { ServerTypeRegistry } from './configs/index.js';

//      ___ __  __ ____   ___  ____ _____ ____      __  ____  _____  _  _____ _____
//     |_ _|  \/  |  _ \ / _ \|  _ |_   _/ ___|    / / / ___||_   _|/ \|_   _| ____|
//      | || |\/| | |_) | | | | |_) || | \___ \    / /  \___ \ | | / _ \ | | |  _|
//      | || |  | |  __/| |_| |  _ < | |  ___) |  / /    ___) || |/ ___ \| | | |___
//     |___|_|  |_|_|    \___/|_| \_\|_| |____/  /_/    |____/ |_/_/   \_|_| |_____|
//

const DebugActive = true;

// Global application state
let servers = [];             // Stores all server objects (name, path, status, etc.)
let activeId = null;          // The ID of the server currently being viewed in the Dashboard
let targetId = null;          // The ID of the server targeted by the Gear icon menu
let draggedItemIndex = null;  // Used for reordering the sidebar list
const GAUGE_MAX = 173;        // SVG stroke-dasharray value for a full semicircle gauge (π × r55)
const DEFAULT_ACCENT = '#007bff';

// Status dashboard timers
let uptimeStart = null;        // Timestamp (ms) when the active server went Online
let uptimeInterval = null;     // setInterval handle for the uptime clock
let playerPollInterval = null; // setInterval handle for player count polling


//      ___ _   _ ___ _____
//     |_ _| \ | |_ _|_   _|
//      | ||  \| || |  | |
//      | || |\  || |  | |
//     |___|_| \_|___| |_|
//

async function init() {
    try {
        servers = await window.api.invoke('get-servers');
        if (!Array.isArray(servers)) servers = [];
    } catch (err) {
        console.error("Failed to fetch servers:", err);
        servers = [];
    }

    initTheme();
    renderSidebar();
    renderTypeCards();
    showView('home');

    const startupPref = localStorage.getItem('launch-on-startup') === 'true';
    const startupChk = document.getElementById('launch-startup-chk');
    if (startupChk) startupChk.checked = startupPref;

    window.updateSystemLog("Ronin Server Manager initialized successfully.");
}

init();

function initTheme() {
    const savedAccent = localStorage.getItem('preferred-accent') || DEFAULT_ACCENT;
    document.documentElement.style.setProperty('--accent', savedAccent);
    window.updateSystemLog(`Applied saved accent color: ${savedAccent}.`);

    const accPicker = document.getElementById('accent-picker');
    const accHex = document.getElementById('hex-display');
    if (accPicker) accPicker.value = savedAccent;
    if (accHex) accHex.innerText = savedAccent.toUpperCase();
    window.updateSystemLog("Synchronized accent color pickers and labels with saved preference.");

    const savedBg = localStorage.getItem('preferred-bg-color') || '#0f111a';
    document.documentElement.style.setProperty('--bg-color', hexToRgb(savedBg));
    window.updateSystemLog(`Applied saved background color: ${savedBg}.`);

    const bgPicker = document.getElementById('bg-color-picker');
    const bgHex = document.getElementById('bg-hex-display');
    if (bgPicker) bgPicker.value = savedBg;
    if (bgHex) bgHex.innerText = savedBg.toUpperCase();
    window.updateSystemLog("Synchronized background color pickers and labels with saved preference.");

    const savedBgOp = localStorage.getItem('preferred-bg-opacity') || "1.0";
    document.documentElement.style.setProperty('--bg-opacity', savedBgOp);
    window.updateSystemLog(`Applied saved background opacity: ${savedBgOp}.`);

    const opSlider = document.getElementById('bg-opacity-slider');
    const opLabel = document.getElementById('bg-opacity-label');
    if (opSlider) opSlider.value = savedBgOp;
    if (opLabel) opLabel.innerText = Math.round(savedBgOp * 100) + "%";
    window.updateSystemLog("Synchronized background opacity slider and label with saved preference.");

    const accentGrid = document.querySelector('.card:nth-child(2) .swatch-grid');
    if (accentGrid) updateActiveSwatches(accentGrid, savedAccent);
    window.updateSystemLog("Updated active state on accent color swatches.");

    const bgGrid = document.querySelector('.card:nth-child(3) .swatch-grid');
    if (bgGrid) updateActiveSwatches(bgGrid, savedBg);
    window.updateSystemLog("Updated active state on background color swatches.");

    const savedText = localStorage.getItem('preferred-text-color') || '#ffffff';
    document.documentElement.style.setProperty('--text-color', hexToRgb(savedText));
    window.updateSystemLog(`Applied saved text color: ${savedText}.`);

    const textPicker = document.getElementById('text-color-picker');
    const textHex = document.getElementById('text-hex-display');
    if (textPicker) textPicker.value = savedText;
    if (textHex) textHex.innerText = savedText.toUpperCase();
    window.updateSystemLog("Synchronized text color pickers and labels with saved preference.");

    window.updateSystemLog("Initialization complete. Server types rendered and UI is ready.");
}

// Asks the backend if we have Admin rights; displays the green badge if true
window.api.invoke('check-admin').then(isAdmin => {
    if (isAdmin) {
        document.getElementById('admin-badge').style.display = 'inline-block';
        console.log("[RSM] Running with Administrative privileges.");
        window.updateSystemLog("Running with Administrative privileges. You can manage servers that require elevated permissions.");
    } else {
        window.updateSystemLog("Running without Administrative privileges. Some servers may require elevation to start/stop properly.");
    }
});

// Dynamically builds the server type selection cards on the Add/Edit Server modal
function renderTypeCards() {
    const grid = document.getElementById('server-type-grid');
    if (!grid) return;

    grid.innerHTML = '';

    Object.keys(ServerTypeRegistry).forEach(key => {
        const config = ServerTypeRegistry[key];
        const card = document.createElement('div');
        card.className = 'type-card';
        card.onclick = () => window.selectServerType(key);

        const iconHtml = config.meta.icon.includes('/')
            ? `<img src="${config.meta.icon}" class="type-icon" style="width:40px; height:40px; object-fit:contain;">`
            : `<span class="type-icon">${config.meta.icon}</span>`;

        card.innerHTML = `
            ${iconHtml}
            <span>${config.meta.displayName}</span>
        `;
        grid.appendChild(card);
    });

    const otherCard = document.createElement('div');
    otherCard.className = 'type-card';
    otherCard.onclick = () => window.selectServerType('other');
    otherCard.innerHTML = `<span class="type-icon">🛠️</span><span>Custom / Other</span>`;
    grid.appendChild(otherCard);
}


//  __   _____ _______        __  __    _    _   _    _    ____ _____ __  __ _____ _   _ _____
//  \ \ / /_ _| ____\ \      / / |  \/  |  / \  | \ | |  / \  / ___|| __||  \/  | __| \| |_   _|
//   \ V / | ||  _|  \ \ /\ / /  | |\/| | / _ \ |  \| | / _ \| |  _ |  _| | |\/| | _| .` | | |
//    | |  | || |___  \ V  V /   | |  | |/ ___ \| |\  |/ ___ | |_| || |___| |  | | |__| |\ | | |
//    |_| |___|_____|  \_/\_/    |_|  |_/_/   \_|_| \_/_/   \_\____|_|____|_|  |_|_____|_| \_| |_|
//

window.showView = (viewName) => {
    const views = {
        'home': document.getElementById('no-selection'),
        'manager': document.getElementById('manager-ui'),
        'settings': document.getElementById('settings-ui')
    };

    Object.values(views).forEach(v => {
        if (v) {
            v.style.setProperty('display', 'none', 'important');
            v.style.pointerEvents = 'none';
        }
    });

    const activeView = views[viewName];
    if (activeView) {
        const displayType = (viewName === 'settings') ? 'block' : 'flex';
        activeView.style.setProperty('display', displayType, 'important');
        activeView.style.pointerEvents = 'auto';
        activeView.style.height = viewName === 'manager' ? '100%' : 'auto';
    }

    if (viewName !== 'manager') {
        activeId = null;
        renderSidebar();
    }
};


//      ____  ___ ____  _____  ____    _    ____     __  ____  _____ ______     _______ ____
//     / ___|_ _|  _ \| ____|| __ )  / \  |  _ \   / / / ___|| ____|  _ \ \   / / ____|  _ \
//     \___ \| || | | | _|   |  _ \ / _ \ | |_) | / /  \___ \|  _| | |_) \ \ / /|  _| | |_) |
//      ___) | || |_| | |___ | |_) / ___ \|  _ < / /    ___) | |___|  _ < \ V / | |___|  _ <
//     |____/___|____/|_____||____/_/   \_|_| \_/_/    |____/|_____|_| \_\ \_/  |_____|_| \_\
//

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
        item.className = `nav-item ${activeId === s.id ? 'active' : ''}`;
        item.draggable = true;

        const config = ServerTypeRegistry[s.type];
        const icon = config ? config.meta.icon : '🖥️';
        const iconHtml = icon.includes('/') ? `<img src="${icon}" class="nav-type-icon" style="width:25px; height:25px; margin-right:5px; margin-top:5px;">` : `<span class="type-icon" style="margin-right:3px;">${icon}</span>`;

        item.innerHTML = `
            <div class="nav-content">
                <span class="status-dot ${s.status === 'Online' ? 'dot-online' : 'dot-offline'}"></span>
                ${iconHtml}
                <span class="server-name">${s.name}</span>
            </div>
            <div class="item-options-gear" onclick="toggleSidebarMenu(event, '${s.id}')" style="position:absolute; right:0;">
                ⚙️
            </div>
        `;

        item.addEventListener('dragstart', () => { draggedItemIndex = index; item.style.opacity = '0.4'; });
        item.addEventListener('dragend', () => item.style.opacity = '1');
        item.addEventListener('dragover', (e) => e.preventDefault());
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            handleSort(draggedItemIndex, index);
        });
        item.onclick = (e) => {
            if (!e.target.closest('.item-options-gear')) selectServer(s.id);
        };
        nav.appendChild(item);
    });
}

// Saves the new order after a drag-drop reorder
function handleSort(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const movedItem = servers.splice(fromIndex, 1)[0];
    servers.splice(toIndex, 0, movedItem);
    window.api.send('save-servers', servers);
    renderSidebar();
}

// Populates the dashboard with logs and info for the selected server
function selectServer(id) {
    activeId = id;
    const srv = servers.find(s => s.id === id);
    if (!srv) return;

    updateGauge('cpu', 0, '...');
    updateGauge('ram', 0, '...');

    showView('manager');
    const typeLabel = srv.type ? ` [${srv.type}]` : "";
    document.getElementById('active-name').innerText = srv.name + typeLabel;

    const consoleEl = document.getElementById('console');
    consoleEl.innerHTML = "";
    if (srv.logs) {
        const history = document.createElement('div');
        history.style.whiteSpace = 'pre-wrap';
        history.textContent = srv.logs;
        consoleEl.appendChild(history);
    } else {
        consoleEl.innerHTML = "<div>Console ready...</div>";
    }

    setTimeout(() => { consoleEl.scrollTop = consoleEl.scrollHeight; }, 50);

    const statusEl = document.getElementById('active-status');
    statusEl.innerText = srv.status || 'Offline';
    statusEl.style.color = srv.status === 'Online' ? 'var(--success)' : 'var(--danger)';

    const pidEl = document.getElementById('stat-pid');
    if (pidEl) pidEl.innerText = srv.pid || '—';

    renderSidebar();

    // Show or hide the Edit Config button based on whether this game has config files defined
    const config = ServerTypeRegistry[srv.type];
    const editCfgBtn = document.getElementById('btn-edit-config');
    if (editCfgBtn) {
        editCfgBtn.style.display = config?.gameFiles?.configs?.length ? 'inline-flex' : 'none';
    }

    // Populate quick action buttons from the game config
    const actions = config?.quickActions || [];
    const qaCard = document.getElementById('quick-actions-card');
    const qaBar = document.getElementById('quick-actions-bar');

    if (qaCard && qaBar) {
        if (actions.length > 0) {
            qaBar.innerHTML = '';
            actions.forEach(({ label, command }) => {
                const btn = document.createElement('button');
                btn.className = 'quick-action-btn';
                btn.textContent = label;
                btn.disabled = (srv.status !== 'Online');
                btn.onclick = () => window.sendQuickAction(command);
                qaBar.appendChild(btn);
            });
            qaCard.style.display = 'block';
        } else {
            qaCard.style.display = 'none';
        }
    }
}


//       ____  _____    _    ____    __  __ _____ _   _ _   _
//      / ___|| ____|  / \  |  _ \  |  \/  | ____| \ | | | | |
//     | |  _ |  _|   / _ \ | |_) | | |\/| |  _| |  \| | | | |
//     | |_| || |___ / ___ \|  _ <  | |  | | |___| |\  | |_| |
//      \____||_____/_/   \_|_| \_\ |_|  |_|_____|_| \_|\___/
//

window.toggleSidebarMenu = (event, srvId) => {
    event.stopPropagation();

    targetId = srvId;

    const menu = document.getElementById("options-dropdown");
    const links = menu.querySelectorAll('a');

    if (links[0]) links[0].onclick = () => window.openEditModal(srvId);
    if (links[1]) links[1].onclick = () => window.openServerFolder(srvId);
    if (links[2]) links[2].onclick = () => window.deleteServer(srvId);

    menu.style.top = `${event.clientY}px`;
    menu.style.left = `${event.clientX + 10}px`;
    menu.classList.add("show");

    console.log(`[RSM-DEBUG] Menu opened for server: ${srvId}`);
};

window.deleteServer = (id) => {
    const idToRemove = id || targetId;

    if (!idToRemove) {
        console.error("[RSM-ERROR] No ID found to delete.");
        return;
    }

    console.log(`[RSM-DEBUG] Delete server attempt for ID: ${idToRemove}`);

    if (confirm("Are you sure you want to delete this server? This cannot be undone.")) {
        const originalLength = servers.length;
        servers = servers.filter(s => s.id.toString() !== idToRemove.toString());

        if (servers.length < originalLength) {
            window.api.send('save-servers', servers);

            if (activeId === idToRemove) {
                window.showView('home');
            }

            renderSidebar();
            console.log(`[RSM-DEBUG] Server with ID ${idToRemove} successfully deleted.`);
        } else {
            console.warn("[RSM-WARN] No server found with that ID to delete.");
        }
    }
};

window.openEditModal = (serverId) => {
    console.log("[RSM-DEBUG] openEditModal triggered with ID:", serverId);

    if (!serverId) {
        console.error("[RSM-ERROR] No serverId passed to the function!");
        return;
    }

    const srv = servers.find(s => s.id.toString() === serverId.toString());

    if (!srv) {
        console.error("[RSM-ERROR] Could not find server in the list. Available IDs:", servers.map(s => s.id));
        return;
    }
    console.log("[RSM-DEBUG] Server found:", srv.name, "| Type:", srv.type);

    window.editingServerId = srv.id;
    const type = srv.type || 'other';
    window.selectedType = type;
    console.log("[RSM-DEBUG] State set. editingServerId:", window.editingServerId, "type:", type);

    console.log("[RSM-DEBUG] Calling selectServerType...");
    if (typeof window.selectServerType === 'function') {
        window.selectServerType(type);
    } else {
        console.warn("[RSM-WARN] window.selectServerType is not defined!");
    }

    try {
        document.getElementById('newName').value = srv.name || "";
        document.getElementById('exePath').value = srv.path || "";

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

window.browse = async () => {
    const filePath = await window.api.invoke('open-dialog');
    if (filePath) document.getElementById('exePath').value = filePath;
};

window.browseLogFolder = async () => {
    const folderPath = await window.api.invoke('select-folder');
    if (folderPath) document.getElementById('logPath').value = folderPath;
};

window.browseWorkingFolder = async () => {
    const folderPath = await window.api.invoke('select-folder');
    if (folderPath) document.getElementById('workingDir').value = folderPath;
};

window.openServerFolder = (targetId) => {
    if (!targetId) return;
    const srv = servers.find(s => s.id === targetId);
    if (!srv) return;

    const folderToOpen = srv.workingDir || srv.exePath || srv.path;

    if (folderToOpen) {
        window.updateSystemLog(`Opening folder for server "${srv.name}": ${folderToOpen}`);
        window.api.send('open-folder', folderToOpen);
    } else {
        window.updateSystemLog(`No valid folder path found for server "${srv.name}".`);
    }
};

// Close gear menu when clicking anywhere outside it
window.addEventListener('mousedown', (event) => {
    const menu = document.getElementById("options-dropdown");
    if (menu && !event.target.closest('.item-options-gear') && !event.target.closest('#options-dropdown')) {
        menu.classList.remove('show');
    }
});


//      ____  _____ ______     _______ ____     ___ ___  _   _ _____ ____   ___  _     ____
//     / ___|| ____|  _ \ \   / / ____|  _ \   / __/ _ \| \ | |_   _| __ ) / _ \| |   / ___|
//     \___ \|  _| | |_) \ \ / /|  _| | |_) | | (_| | | |  \| | | | |  _ \| | | | |   \___ \
//      ___) | |___|  _ < \ V / | |___|  _ <   \__ | |_| | |\  | | | | |_) | |_| | |___ ___) |
//     |____/|_____|_| \_\ \_/  |_____|_| \_\  |___/\___/|_| \_| |_| |____/ \___/|_____|____/
//

window.startServer = () => {
    const srv = servers.find(s => s.id === activeId);
    if (srv && srv.status !== 'Online') {
        window.updateSystemLog(`Attempting to start server "${srv.name}"...`);
        srv.status = 'Online'; // Optimistic UI update
        renderSidebar();
        document.getElementById('crash-alert').style.display = 'none';
        window.api.send('start-server', srv);
    }
};

window.stopServer = () => {
    const srv = servers.find(s => s.id === activeId);

    if (srv) {
        window.updateSystemLog(`Attempting to stop server "${srv.name}"...`);
        window.api.send('stop-server', srv.id);
    } else {
        console.error("[RSM] Stop failed: No active server selected or found.");
    }
};

window.killServer = () => {
    const srv = servers.find(s => s.id === activeId);
    if (srv && srv.pid) {
        if (confirm(`FORCE KILL "${srv.name}"?`)) {
            window.updateSystemLog(`Force killing server "${srv.name}"...`);
            window.api.send('kill-server', srv.pid);
        }
    }
};

// Starts or stops ALL servers from the sidebar global action buttons
window.globalAction = (action) => {
    servers.forEach(srv => {
        if (action === 'start' && srv.status !== 'Online') {
            window.api.send('start-server', srv);
        } else if (action === 'stop' && srv.status === 'Online') {
            window.api.send('stop-server', srv.id);
        }
    });
    window.updateSystemLog(`Global ${action} triggered for all servers.`);
};


//      ___ ___  _   _ ____   ___  _     _____
//     / __/ _ \| \ | / ___| / _ \| |   | ____|
//    | (_| | | |  \| \___ \| | | | |   |  _|
//     \__ | |_| | |\  |___) | |_| | |___| |___
//     |___/\___/|_| \_|____/ \___/|_____|_____|
//

window.sendConsoleCommand = (event) => {
    if (event.key === 'Enter') {
        const inputEl = document.getElementById('console-input');
        const command = inputEl.value.trim();

        if (command && activeId) {
            const srv = servers.find(s => s.id === activeId);
            const consoleEl = document.getElementById('console');

            if (consoleEl) {
                const echoLine = document.createElement('div');
                echoLine.style.color = '#888';
                echoLine.style.whiteSpace = 'pre-wrap';
                echoLine.textContent = `> ${command}`;
                consoleEl.appendChild(echoLine);
                consoleEl.scrollTop = consoleEl.scrollHeight;
            }

            window.api.send('send-command', {
                srvId: activeId,
                command: command
            });

            inputEl.value = '';
            window.updateSystemLog(`Command sent to ${srv ? srv.name : 'Unknown'}: ${command}`);
        }
    }
};

// Fires a predefined command without needing the console input field
window.sendQuickAction = (command) => {
    if (!activeId) return;
    const srv = servers.find(s => s.id === activeId);
    const consoleEl = document.getElementById('console');

    if (consoleEl) {
        const echoLine = document.createElement('div');
        echoLine.style.color = '#888';
        echoLine.style.whiteSpace = 'pre-wrap';
        echoLine.textContent = `> ${command}`;
        consoleEl.appendChild(echoLine);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    window.api.send('send-command', { srvId: activeId, command });
    window.updateSystemLog(`Quick action sent to ${srv ? srv.name : 'Unknown'}: ${command}`);
};


//      ____  _____  _  _____ _   _ ____    ____    _    ____  _   _  ____   ___    _    ____  ____
//     / ___||_   _|/ \|_   _| | | / ___|  |  _ \  / \  / ___|| | | | __ ) / _ \  / \  |  _ \|  _ \
//     \___ \ | | / _ \ | | | | | \___ \  | | | |/ _ \ \___ \| |_| |  _ \| | | |/ _ \ | |_) | | | |
//      ___) || |/ ___ \| | | |_| |___) | | |_| / ___ \ ___) |  _  | |_) | |_| / ___ \|  _ <| |_| |
//     |____/ |_/_/   \_|_|  \___/|____/  |____/_/   \_|____/|_| |_|____/ \___/_/   \_|_| \_|____/
//

function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function startStatusDashboard(srvId) {
    uptimeStart = Date.now();
    if (uptimeInterval) clearInterval(uptimeInterval);
    uptimeInterval = setInterval(() => {
        document.getElementById('stat-uptime').innerText = formatUptime(Date.now() - uptimeStart);
    }, 1000);

    window.api.send('get-player-count', srvId);
    if (playerPollInterval) clearInterval(playerPollInterval);
    playerPollInterval = setInterval(() => {
        window.api.send('get-player-count', srvId);
    }, 30000);
}

function stopStatusDashboard() {
    if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null; }
    if (playerPollInterval) { clearInterval(playerPollInterval); playerPollInterval = null; }
    uptimeStart = null;

    document.getElementById('stat-players').innerText = '— / —';
    document.getElementById('stat-uptime').innerText = '—';
}


//      ___ ____   ____   _     ___ ____ _____ ___ _   _ _____ ____  ____
//     |_ _|  _ \ / ___| | |   |_ _/ ___|_   _| __| \ | | ____|  _ \/ ___|
//      | || |_) | |     | |    | |\___ \ | | | _||  \| |  _| | |_) \___ \
//      | ||  __/| |___  | |___ | | ___) || | | |__| |\  | |___|  _ < ___) |
//     |___|_|    \____| |_____|___|____/ |_| |____|_| \_|_____|_| \_|____/
//

// Appends new text from the server's console to the UI
window.api.receive('console-out', (data) => {
    const srv = servers.find(s => s.id === data.id);

    if (srv) {
        srv.logs = (srv.logs || "") + data.msg;
        // Keep memory usage low: only store the last 50,000 characters
        if (srv.logs.length > 50000) {
            srv.logs = srv.logs.substring(srv.logs.length - 50000);
        }
    }

    if (activeId === data.id) {
        const c = document.getElementById('console');
        if (c) {
            const logLine = document.createElement('div');
            logLine.style.whiteSpace = 'pre-wrap';
            logLine.style.wordBreak = 'break-all';
            logLine.textContent = data.msg;

            c.appendChild(logLine);
            c.scrollTop = c.scrollHeight;

            if (c.childNodes.length > 500) {
                c.removeChild(c.firstChild);
            }
        }

        // Parse Minecraft 'list' response to update the player count pill
        const srv = servers.find(s => s.id === data.id);
        if (srv?.type === 'minecraft') {
            const match = data.msg.match(/There are (\d+) of a max of (\d+) players/i);
            if (match) document.getElementById('stat-players').innerText = `${match[1]} / ${match[2]}`;
        }
    }
});

// Updates the UI when a server starts, stops, or crashes
window.api.receive('status-change', (data) => {
    const srv = servers.find(s => s.id === data.id);
    if (srv) {
        srv.status = data.status;
        srv.pid = data.pid || null;
        window.updateSystemLog(`Server "${srv.name}" is now ${data.status}.`);
        renderSidebar();
    }

    if (activeId === data.id) {
        if (data.status === 'Online') {
            document.getElementById('crash-alert').style.display = 'none';
            startStatusDashboard(data.id);
        } else {
            stopStatusDashboard();
        }
        selectServer(activeId);

        if (data.crash) {
            document.getElementById('crash-alert').style.display = 'block';
            document.getElementById('crash-msg').innerText = `Crash at ${data.crash.time}`;
            window.updateSystemLog(`Server "${srv.name}" crashed at ${data.crash.time}.`);

            if (document.getElementById('auto-restart-chk').checked) {
                window.updateSystemLog(`Auto-restart is enabled. Attempting to restart "${srv.name}" in 5 seconds...`);
                setTimeout(window.startServer, 5000);
            }
        }
    }
});

// Receives player count + session name from main; updates the status bar pills
window.api.receive('player-count-update', (data) => {
    if (data.id !== activeId) return;
    if (data.players !== null) document.getElementById('stat-players').innerText = data.players;
});

// Receives per-server CPU/RAM data every 2 seconds; updates circular gauges
window.api.receive('server-perf-update', (data) => {
    console.log(`Update received for ${data.id}. Current view is ${activeId}`);
    const srv = servers.find(s => s.id === data.id);
    if (!srv) return;

    srv.ramMB = data.ramRaw;

    if (activeId === data.id) {
        console.log(`[RSM-DEBUG] Updating gauges for server "${srv.name}": CPU ${data.cpu}% | RAM ${data.ramPercent}% (${data.ramDisplay})`);
        updateGauge('cpu', data.cpu || 0);
        updateGauge('ram', data.ramPercent, data.ramDisplay);
    }
});

// Receives total machine usage for the home screen gauges
window.api.receive('total-performance-update', (data) => {
    updateGauge('total-cpu', data.cpu);
    updateGauge('total-ram', data.ram);
});

window.api.receive('system-error', (errorMsg) => window.updateSystemLog(`ERROR: ${errorMsg}`));
window.api.receive('system-info', (infoMsg) => window.updateSystemLog(`INFO: ${infoMsg}`));


//       ____    _   _   _  ____ ___ ____
//      / ___|  / \ | | | |/ ___| __/ ___|
//     | |  _  / _ \| | | | |  _| _\___ \
//     | |_| |/ ___ | |_| | |_| | |_ ___) |
//      \____/_/   \_\___/ \____|___|____/
//

function updateGauge(type, percent, label) {
    const el = document.getElementById(`${type}-gauge`);
    const valEl = document.getElementById(`${type}-val`);

    if (!el) return;

    let cleanPercent = typeof percent === 'string' ? parseFloat(percent.replace('%', '')) : percent;

    if (isNaN(cleanPercent)) return;

    const val = Math.min(Math.max(cleanPercent, 0), 100);
    const GAUGE_LENGTH = 173;
    const offset = GAUGE_LENGTH - (val / 100 * GAUGE_LENGTH);

    el.style.strokeDashoffset = offset;

    if (valEl) {
        valEl.textContent = label ? label : Math.round(val) + "%";
    }
}


//      _    ____  ____    ____  _____ ______     _______ ____    __        _____ _____   _    ____  ____
//     / \  |  _ \|  _ \  / ___|| ____|  _ \ \   / / ____|  _ \   \ \      / |_ _|__  |  / \  |  _ \|  _ \
//    / _ \ | | | | | | | \___ \|  _| | |_) \ \ / /|  _| | |_) |   \ \ /\ / / | |  / /| / _ \ | |_) | | | |
//   / ___ \| |_| | |_| |  ___) | |___|  _ < \ V / | |___|  _ <     \ V  V /  | | / /_|/  __ \|  _ <| |_| |
//  /_/   \_|____/|____/  |____/|_____|_| \_\ \_/  |_____|_| \_\     \_/\_/  |___|____|\_/  \_/\_|_|\_____/
//

window.openModal = () => {
    document.getElementById('modal').style.display = 'flex';
};

window.openAddModal = () => {
    window.editingServerId = null;
    window.selectedType = null;

    const form = document.querySelector('#wizard-step-2 form');
    if (form) form.reset();

    window.showWizardStep(1);
    window.openModal();
};

window.closeModal = () => {
    document.getElementById('modal').style.display = 'none';
    window.editingServerId = null;
    window.showWizardStep(1);
};

// Swaps between Step 1 (game type cards) and Step 2 (config form)
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

// Triggered when a user clicks a game type card; configures the form for that game
window.selectServerType = (type) => {
    window.selectedType = type;
    const config = ServerTypeRegistry[type];

    if (!config) {
        document.querySelectorAll('.platform-specific').forEach(b => b.style.display = 'block');
        document.getElementById('path-label').innerText = "EXECUTABLE PATH";
        document.getElementById('port-label').innerText = "PORT";
        document.getElementById('portpass-label').innerText = "PASSWORD";

        const neutralFields = ['newName', 'exePath', 'workingDir', 'customArgs', 'portId', 'logPath', 'portPass'];
        neutralFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = ""; el.placeholder = ""; }
        });

        document.getElementById('customArgs').placeholder = "-flag1 -flag2 -config 'path/to/file'";
        window.showWizardStep(2);
        return;
    }

    const labelEl = document.getElementById('path-label');
    if (labelEl) labelEl.innerText = config.label || "EXECUTABLE PATH";

    const portLabelEl = document.getElementById('port-label');
    if (portLabelEl) portLabelEl.innerText = (config.defaults?.portId || "PORT").toUpperCase();

    const portPassLabelEl = document.getElementById('portpass-label');
    if (portPassLabelEl) portPassLabelEl.innerText = (config.defaults?.portPass || "PASSWORD").toUpperCase();

    const blockMap = {
        'path-block': config.blocks.path,
        'working-dir-block': config.blocks.workingDir,
        'log-block': config.blocks.log,
        'port-block': config.blocks.port,
        'portpass-block': config.blocks.portPass,
        'args-block': config.blocks.args
    };

    Object.entries(blockMap).forEach(([id, displayValue]) => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = displayValue || 'none';
        }
    });

    const fieldsToUpdate = ['newName', 'exePath', 'workingDir', 'logPath', 'portId', 'portPass', 'customArgs'];

    fieldsToUpdate.forEach(field => {
        const inputEl = document.getElementById(field);
        if (!inputEl) return;

        inputEl.value = "";
        inputEl.placeholder = "";

        const mode = config.varInputs?.[field] || "placeholder";
        const defaultValue = config.defaults?.[field] || "";

        if (defaultValue) {
            inputEl[mode] = defaultValue;
        }
    });

    window.showWizardStep(2);
};

window.goBackToStep1 = () => {
    window.showWizardStep(1);
};

window.openActiveFolder = () => {
    window.openServerFolder(activeId);
};

// Adds a new server or updates an existing one in the servers list
window.saveNewServer = () => {
    const name = document.getElementById('newName').value;
    const path = document.getElementById('exePath').value;
    const type = window.selectedType || "other";
    const config = ServerTypeRegistry[type] || {};
    const category = config ? config.backend.category : "DIRECT_CONSOLE";

    const apiPort = document.getElementById('portId').value || "8080";
    const apiPass = document.getElementById('portPass').value || "";
    const args = document.getElementById('customArgs').value || "";
    const workingDir = document.getElementById('workingDir').value || "";
    const logPath = document.getElementById('logPath').value || "";
    const mcRam = document.getElementById('mcRam')?.value || "";
    const seInstance = document.getElementById('seInstance')?.value || "";

    if (!name || !path) return alert("Please provide a name and select an executable.");

    if (window.editingServerId) {
        const index = servers.findIndex(s => s.id.toString() === window.editingServerId.toString());
        if (index !== -1) {
            const existing = servers[index];
            servers[index] = {
                ...existing,
                name, path, apiPort, apiPass, args, logPath, workingDir, mcRam, seInstance, type, category
            };
            if (DebugActive) {
                window.updateSystemLog(`---Saving server ${name} with the following settings---`);
                window.updateSystemLog(`Name: ${name}\nType: ${type}\nPath: ${path}\nPort: ${apiPort}\nAPI Pass: ${apiPass}\nLogPath: ${logPath}\nWorking Directory: ${workingDir}\nArgs: ${args}`);
            }
        }
    } else {
        servers.push({
            id: Date.now().toString(),
            type, category, name, path, apiPort, apiPass, mcRam, seInstance,
            args, logPath, workingDir,
            status: 'Offline', logs: '', pid: null
        });
    }

    window.api.send('save-servers', servers);
    renderSidebar();

    const fieldsToClear = ['newName', 'exePath', 'portId', 'portPass', 'workingDir', 'customArgs', 'logPath', 'mcRam', 'seInstance'];
    fieldsToClear.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    window.selectedType = null;
    window.editingServerId = null;
    window.updateSystemLog(`Saving server ${name} successful as ${category}`);
    closeModal();
};


//      ____  _____ _____ _____ ___ _   _  ____ ____      _   _____ _   _ ___ __  __ _____
//     / ___|| ____|_   _|_   _|_ _| \ | |/ ___/ ___|    / \ |_   _| | | | __||  \/  | ____|
//     \___ \|  _|  | |   | |  | ||  \| | |  _\___ \   / _ \  | | | |_| | _| | |\/| |  _|
//      ___) | |___ | |   | |  | || |\  | |_| |___) | / ___ \ | | |  _  | |___| |  | | |___
//     |____/|_____||_|   |_| |___|_| \_|\____|____/ /_/   \_\|_| |_| |_|_____|_|  |_|_____|
//

window.updateAccent = (color) => {
    document.documentElement.style.setProperty('--accent', color);
    localStorage.setItem('preferred-accent', color);

    if (document.getElementById('accent-wrapper')) document.getElementById('accent-wrapper').style.backgroundColor = color;
    if (document.getElementById('hex-display')) document.getElementById('hex-display').innerText = color.toUpperCase();
    if (document.getElementById('accent-picker')) document.getElementById('accent-picker').value = color;

    const accentGrid = document.querySelector('.card:nth-child(2) .swatch-grid');
    updateActiveSwatches(accentGrid, color);
};

window.updateBgColor = (hex) => {
    const rgb = hexToRgb(hex);
    document.documentElement.style.setProperty('--bg-color', rgb);
    localStorage.setItem('preferred-bg-color', hex);
    if (document.getElementById('bg-wrapper')) document.getElementById('bg-wrapper').style.backgroundColor = hex;

    if (document.getElementById('bg-hex-display')) document.getElementById('bg-hex-display').innerText = hex.toUpperCase();
    if (document.getElementById('bg-color-picker')) document.getElementById('bg-color-picker').value = hex;

    const bgGrid = document.querySelector('.card:nth-child(3) .swatch-grid');
    updateActiveSwatches(bgGrid, hex);
};

function updateTextColor(hex) {
    const rgb = hexToRgb(hex);
    document.documentElement.style.setProperty('--text-color', rgb);
    if (document.getElementById('text-wrapper')) document.getElementById('text-wrapper').style.backgroundColor = hex;

    const hexDisplay = document.getElementById('text-hex-display');
    if (hexDisplay) hexDisplay.innerText = hex.toUpperCase();

    localStorage.setItem('preferred-text-color', hex);
}

window.updateOpacity = (type, value) => {
    if (type === 'bg') {
        document.documentElement.style.setProperty('--bg-opacity', value);

        const label = document.getElementById('bg-opacity-label');
        if (label) label.innerText = Math.round(value * 100) + "%";

        localStorage.setItem('preferred-bg-opacity', value);
        window.updateSystemLog(`Opacity adjusted to ${Math.round(value * 100)}%`);
    }
};

// Updates the 'active' white border/glow on color swatches
function updateActiveSwatches(container, color) {
    if (!container) return;
    container.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.classList.remove('active');
        if (swatch.style.backgroundColor && rgbToHex(swatch.style.backgroundColor) === color.toLowerCase()) {
            swatch.classList.add('active');
        }
    });
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
}

function rgbToHex(rgb) {
    if (!rgb) return "";
    let a = rgb.split("(")[1].split(")")[0].split(",");
    return "#" + a.map(x => {
        x = parseInt(x).toString(16);
        return (x.length == 1) ? "0" + x : x;
    }).join("");
}

// Preset 1: Internal Fire
window.applyFireTheme = () => {
    window.updateSystemLog(`Applying "Internal Fire" theme preset with Accent: #ff4500, Background: #0a0a0a, Text: #ffffff.`);
    applyPreset({ accent: "#ff4500", bg: "#0a0a0a", text: "#ffffff" }, "Internal Fire");
};

// Preset 2: Ronin Classic
window.applyDefaultTheme = () => {
    applyPreset({ accent: "#007bff", bg: "#0f111a", text: "#ffffff" }, "Ronin Classic");
    window.updateSystemLog(`Applying "Ronin Classic" theme preset with Accent: #007bff, Background: #0f111a, Text: #ffffff.`);
};

function applyPreset(theme, name) {
    if (window.updateAccent) window.updateAccent(theme.accent);
    if (window.updateBgColor) window.updateBgColor(theme.bg);
    if (window.updateTextColor) window.updateTextColor(theme.text);
    window.updateSystemLog(`Applying theme preset: "${name}" with Accent: ${theme.accent}, Background: ${theme.bg}, Text: ${theme.text}.`);

    const pickerMap = {
        'accent-picker': theme.accent,
        'bg-color-picker': theme.bg,
        'text-color-picker': theme.text
    };

    for (const [id, value] of Object.entries(pickerMap)) {
        const input = document.getElementById(id);
        if (input) input.value = value;
    }

    if (window.updateSystemLog) {
        window.updateSystemLog(`[Theme] Preset "${name}" applied.`);
    }
}

// Saves or clears the Windows startup entry based on the toggle setting
window.toggleStartup = (isEnabled) => {
    window.api.send('update-startup-settings', isEnabled);
    localStorage.setItem('launch-on-startup', isEnabled);
    window.updateSystemLog(`Launch on startup: ${isEnabled ? 'enabled' : 'disabled'}.`);
};


//      ____ ___  _   _ _____ ___ ____      _____ ____  ___ _____ ___  ____
//     / ___/ _ \| \ | |  ___|_ _/ ___|    | ____|  _ \|_ _|_   _/ _ \|  _ \
//    | |  | | | |  \| | |_   | | |  _     |  _| | | | || |  | || | | | |_) |
//    | |__| |_| | |\  |  _|  | | |_| |    | |___| |_| || |  | || |_| |  _ <
//     \____\___/|_| \_|_|   |___\____|    |_____|____/|___| |_| \___/|_| \_\
//

let cfgActiveTabIndex = 0;
let cfgOriginalContent = '';
let cfgCurrentFilePath = '';

// Resolves the full absolute path for a config file entry, supporting both
// relative subfolders and absolute paths (e.g. %USERPROFILE% style games)
function resolveCfgPath(srv, fileEntry) {
    const workingDir = (srv.workingDir || '').replace(/[/\\]+$/, '');
    const config = ServerTypeRegistry[srv.type];
    const subDir = config?.gameFiles?.configPath || '';
    const isAbsolute = /^[A-Za-z]:[/\\]/.test(subDir);
    const base = subDir
        ? (isAbsolute ? subDir.replace(/[/\\]+$/, '') : workingDir + '\\' + subDir.replace(/[/\\]/g, '\\').replace(/^\\+|\\+$/g, ''))
        : workingDir;
    return base + '\\' + fileEntry.file;
}

window.openConfigEditor = async () => {
    const srv = servers.find(s => s.id === activeId);
    if (!srv) return;
    const config = ServerTypeRegistry[srv.type];
    const configs = config?.gameFiles?.configs;
    if (!configs?.length) return;

    document.getElementById('cfg-modal-icon').textContent = config.meta?.icon?.startsWith('logos/') ? '' : (config.meta?.icon || '');
    document.getElementById('cfg-modal-server-name').textContent = srv.name;

    const warnBanner = document.getElementById('cfg-warn-banner');
    warnBanner.style.display = srv.status === 'Online' ? 'block' : 'none';

    const tabsEl = document.getElementById('cfg-tabs');
    tabsEl.innerHTML = '';
    configs.forEach((entry, i) => {
        const tab = document.createElement('button');
        tab.className = 'cfg-tab' + (i === 0 ? ' active' : '');
        tab.textContent = entry.label || entry.file;
        tab.onclick = () => switchCfgTab(i);
        tabsEl.appendChild(tab);
    });

    tabsEl.style.display = configs.length > 1 ? 'flex' : 'none';

    cfgActiveTabIndex = 0;
    await loadCfgTab(srv, 0);

    const modal = document.getElementById('config-modal');
    modal.style.display = 'flex';
};

async function switchCfgTab(index) {
    const srv = servers.find(s => s.id === activeId);
    if (!srv) return;

    const tabs = document.querySelectorAll('.cfg-tab');
    tabs.forEach((t, i) => t.classList.toggle('active', i === index));

    cfgActiveTabIndex = index;
    await loadCfgTab(srv, index);
}

async function loadCfgTab(srv, index) {
    const config = ServerTypeRegistry[srv.type];
    const fileEntry = config.gameFiles.configs[index];
    cfgCurrentFilePath = resolveCfgPath(srv, fileEntry);

    document.getElementById('cfg-file-path').textContent = cfgCurrentFilePath;
    document.getElementById('cfg-save-status').textContent = '';
    document.getElementById('cfg-save-status').classList.remove('visible');

    const result = await window.api.invoke('read-config-file', cfgCurrentFilePath);
    const editor = document.getElementById('cfg-editor');

    if (result.success) {
        editor.value = result.content;
        cfgOriginalContent = result.content;
    } else {
        editor.value = `// Could not read file:\n// ${result.error}`;
        cfgOriginalContent = '';
    }

    updateCfgLineNumbers();
    editor.scrollTop = 0;
    document.getElementById('cfg-line-numbers').scrollTop = 0;
}

function updateCfgLineNumbers() {
    const editor = document.getElementById('cfg-editor');
    const lineNumbers = document.getElementById('cfg-line-numbers');
    const count = editor.value.split('\n').length;
    lineNumbers.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
}

window.saveConfigFile = async () => {
    const editor = document.getElementById('cfg-editor');
    const content = editor.value;
    const statusEl = document.getElementById('cfg-save-status');

    const result = await window.api.invoke('write-config-file', {
        filePath: cfgCurrentFilePath,
        content
    });

    if (result.success) {
        cfgOriginalContent = content;
        statusEl.textContent = '✓ Saved';
        statusEl.style.color = 'var(--success)';
        statusEl.classList.add('visible');
        setTimeout(() => statusEl.classList.remove('visible'), 2500);
    } else {
        statusEl.textContent = `✗ Save failed: ${result.error}`;
        statusEl.style.color = 'var(--danger)';
        statusEl.classList.add('visible');
    }
};

window.discardConfigChanges = () => {
    const editor = document.getElementById('cfg-editor');
    editor.value = cfgOriginalContent;
    updateCfgLineNumbers();
    const statusEl = document.getElementById('cfg-save-status');
    statusEl.classList.remove('visible');
};

window.closeConfigEditor = () => {
    document.getElementById('config-modal').style.display = 'none';
};


//      ____  __   ____  _____ _______  __  _     ___   ____
//     / ___| \ \ / / /_|_   _| ____| \/ / | |   / _ \ / ___|
//     \___ \  \ V /  ___|| | |  _|  /  /  | |  | | | | |  _
//      ___) |  | |  |___ | | | |___/  \   | |__| |_| | |_| |
//     |____/   |_|      \|_| |_____/_/\_\ |_____\___/ \____|
//

window.updateSystemLog = (msg) => {
    const homeConsole = document.getElementById('system-console');
    if (!homeConsole) return;

    const time = new Date().toLocaleTimeString([], { hour12: false });

    const logEntry = document.createElement('div');
    logEntry.style.cssText = "text-align: left; margin-bottom: 2px; width: 100%;";
    logEntry.innerHTML = `
        <span style="color: var(--dim);">[${time}]</span>
        <span style="color: var(--accent);">[System/INFO]:</span>
        <span>${msg}</span>`;

    homeConsole.appendChild(logEntry);
    homeConsole.scrollTop = homeConsole.scrollHeight;

    if (homeConsole.childNodes.length > 500) {
        homeConsole.removeChild(homeConsole.firstChild);
    }
};

// Wire up the console command input field
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

// Wire up config editor line numbers scroll sync
document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('cfg-editor');
    const lineNumbers = document.getElementById('cfg-line-numbers');
    if (!editor || !lineNumbers) return;

    editor.addEventListener('input', updateCfgLineNumbers);
    editor.addEventListener('scroll', () => {
        lineNumbers.scrollTop = editor.scrollTop;
    });
});
