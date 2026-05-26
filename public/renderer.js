import { ServerTypeRegistry } from './configs/index.js';

//      ___ __  __ ____   ___  ____ _____ ____      __  ____  _____  _  _____ _____
//     |_ _|  \/  |  _ \ / _ \|  _ |_   _/ ___|    / / / ___||_   _|/ \|_   _| ____|
//      | || |\/| | |_) | | | | |_) || | \___ \    / /  \___ \ | | / _ \ | | |  _|
//      | || |  | |  __/| |_| |  _ < | |  ___) |  / /    ___) || |/ ___ \| | | |___
//     |___|_|  |_|_|    \___/|_| \_\|_| |____/  /_/    |____/ |_/_/   \_|_| |_____|
//

const DebugActive = true;    // Set to true to enable verbose debug logging
const debugPrefix = "[RSM-DEBUG]";
const DebugLogging = false;  // Set to true to enable detailed sub-operation logging

function DebugLog(message) {
    if (DebugActive) console.log(`${debugPrefix} ${message}`);
}

function DebugConsoleLogs(message) {
    if (DebugLogging) console.log(`${debugPrefix} ${message}`);
}

// Global application state
let servers = [];             // Stores all server objects (name, path, status, etc.)
let activeId = null;          // The ID of the server currently being viewed in the Dashboard
const serverFirewallStatus = {}; // { [srvId]: true | false } — cached per-server firewall rule state
let targetId = null;          // The ID of the server targeted by the Gear icon menu
let draggedItemIndex = null;  // Used for reordering the sidebar list
const GAUGE_MAX = 173;        // SVG stroke-dasharray value for a full semicircle gauge (π × r55)
const DEFAULT_ACCENT = '#007bff';

// Status dashboard timers
let uptimeStart = null;        // Timestamp (ms) when the active server went Online
let uptimeInterval = null;     // setInterval handle for the uptime clock
let playerPollInterval = null; // setInterval handle for player count polling

// Network graph rolling history (60 samples × 2s = 2 min window)
const NET_HISTORY_LEN = 60;
let netRxHistory = new Array(NET_HISTORY_LEN).fill(0);
let netTxHistory = new Array(NET_HISTORY_LEN).fill(0);

// Connection graph rolling history (450 samples × 2s = 15 min window)
const CONN_HISTORY_LEN = 450;
let connHistory = new Array(CONN_HISTORY_LEN).fill(null);


//      ___ _   _ ___ _____
//     |_ _| \ | |_ _|_   _|
//      | ||  \| || |  | |
//      | || |\  || |  | |
//     |___|_| \_|___| |_|
//

async function init() {
    console.log('[RSM] init — renderer initializing...');
    try {
        servers = await window.api.invoke('get-servers');
        if (!Array.isArray(servers)) servers = [];
        console.log(`[RSM] init — loaded ${servers.length} server(s) from main process`);
    } catch (err) {
        console.error('[RSM] init — failed to fetch servers:', err);
        servers = [];
    }

    console.log('[RSM] init — applying theme and rendering sidebar');
    initTheme();
    renderSidebar();
    renderTypeCards();
    showView('home');

    const startupPref = localStorage.getItem('launch-on-startup') === 'true';
    const startupChk = document.getElementById('launch-startup-chk');
    if (startupChk) startupChk.checked = startupPref;

    if (!cfgBackupDir) {
        const desktop = await window.api.invoke('get-desktop-path');
        cfgBackupDir = desktop + '\\RSM-Files\\Backups';
        localStorage.setItem('cfg-backup-dir', cfgBackupDir);
        console.log(`[RSM] init — backup dir defaulted to: ${cfgBackupDir}`);
    }
    const backupInput = document.getElementById('backup-folder-input');
    if (backupInput) backupInput.value = cfgBackupDir;

    const savedWinOpacity = parseFloat(localStorage.getItem('preferred-win-opacity') || '1.0');
    console.log(`[RSM] init — applying window opacity: ${savedWinOpacity}`);
    window.api.send('update-window-opacity', savedWinOpacity);
    const winSlider = document.getElementById('win-opacity-slider');
    const winLabel  = document.getElementById('win-opacity-label');
    if (winSlider) winSlider.value = savedWinOpacity;
    if (winLabel)  winLabel.innerText = Math.round(savedWinOpacity * 100) + '%';

    await loadApiSettings();

    console.log('[RSM] init — renderer ready');
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
        'home':    document.getElementById('no-selection'),
        'manager': document.getElementById('manager-ui'),
        'settings': document.getElementById('settings-ui'),
        'portier': document.getElementById('portier-ui')
    };

    Object.values(views).forEach(v => {
        if (v) {
            v.style.setProperty('display', 'none', 'important');
            v.style.pointerEvents = 'none';
        }
    });

    const activeView = views[viewName];
    if (activeView) {
        const displayType = (viewName === 'settings' || viewName === 'portier') ? 'block' : 'flex';
        activeView.style.setProperty('display', displayType, 'important');
        activeView.style.pointerEvents = 'auto';
        activeView.style.height = viewName === 'manager' ? '100%' : 'auto';
    }

    // Sidebar active highlight
    document.querySelectorAll('.nav-item').forEach(el => el.style.borderLeft = '');
    if (viewName === 'home')    document.querySelector('.nav-item[onclick*="home"]')?.style.setProperty('border-left', '3px solid var(--accent)');
    if (viewName === 'portier') document.getElementById('nav-portier')?.style.setProperty('border-left', '3px solid var(--accent)');

    if (viewName !== 'manager') {
        activeId = null;
        renderSidebar();
    }

    if (viewName === 'portier') loadPortierView();
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

        const hasFwPorts = (config?.firewallPorts?.length > 0);
        let fwBadgeHtml = '';
        if (hasFwPorts) {
            const status = serverFirewallStatus[s.id];
            const badgeState = status === true ? 'active' : status === false ? 'none' : 'inactive';
            const badgeTip   = status === true ? 'Firewall rules active' : status === false ? 'No firewall rules applied' : 'Firewall status unknown';
            fwBadgeHtml = `<span class="portier-nav-badge portier-srv-badge ${badgeState}" title="${badgeTip}"></span>`;
        }

        item.innerHTML = `
            <div class="nav-content">
                <span class="status-dot ${s.status === 'Online' ? 'dot-online' : 'dot-offline'}"></span>
                ${iconHtml}
                <span class="server-name">${s.name}</span>
            </div>
            ${fwBadgeHtml}
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
    console.log(`[RSM] selectServer — id: ${id}`);
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

    // Clear connection history when switching servers — old server's data is not relevant
    connHistory = new Array(CONN_HISTORY_LEN).fill(null);
    const connEl = document.getElementById('stat-connections');
    if (connEl) connEl.innerText = '—';

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

    renderFirewallPorts(srv, config);
}

function renderFirewallPorts(srv, config) {
    console.log(`[RSM] renderFirewallPorts — srv: "${srv.name}" | portDefs: ${config?.firewallPorts?.length || 0}`);
    const card = document.getElementById('firewall-ports-card');
    const rows = document.getElementById('firewall-ports-rows');
    if (!card || !rows) return;

    const portDefs = config?.firewallPorts;
    if (!portDefs?.length) {
        card.style.display = 'none';
        updateFirewallStatus(null);
        return;
    }

    // Merge config defaults with any per-server overrides saved on the server object
    const overrides = srv.firewallPorts || {};

    rows.innerHTML = '';
    portDefs.forEach(def => {
        const override = overrides[def.id] || {};
        const portVal  = override.port ?? def.default;
        const tcpVal   = override.tcp  ?? def.tcp;
        const udpVal   = override.udp  ?? def.udp;

        const row = document.createElement('div');
        row.className = 'fw-port-row';
        row.dataset.portId = def.id;
        row.innerHTML = `
            <span class="fw-port-label" title="${def.description || ''}">${def.label}</span>
            <input class="fw-port-input" type="number" min="1" max="65535"
                   value="${portVal}" data-id="${def.id}" />
            <label class="fw-toggle" title="TCP">
                <input type="checkbox" data-id="${def.id}" data-proto="tcp" ${tcpVal ? 'checked' : ''}>
                <span>TCP</span>
            </label>
            <label class="fw-toggle" title="UDP">
                <input type="checkbox" data-id="${def.id}" data-proto="udp" ${udpVal ? 'checked' : ''}>
                <span>UDP</span>
            </label>
            <span class="fw-port-desc">${def.description || ''}</span>`;
        rows.appendChild(row);
    });

    card.style.display = 'block';
    checkFirewallStatus(srv);
}

window.saveFirewallPortOverrides = async function () {
    const srv = servers.find(s => s.id === activeId);
    if (!srv) return;
    console.log(`[RSM] saveFirewallPortOverrides — srv: "${srv.name}"`);

    const config = ServerTypeRegistry[srv.type];
    const portDefs = config?.firewallPorts || [];
    const overrides = {};

    portDefs.forEach(def => {
        const portInput = document.querySelector(`.fw-port-input[data-id="${def.id}"]`);
        const tcpInput  = document.querySelector(`input[data-id="${def.id}"][data-proto="tcp"]`);
        const udpInput  = document.querySelector(`input[data-id="${def.id}"][data-proto="udp"]`);
        if (!portInput) return;
        overrides[def.id] = {
            port: parseInt(portInput.value, 10) || def.default,
            tcp:  tcpInput  ? tcpInput.checked  : def.tcp,
            udp:  udpInput  ? udpInput.checked  : def.udp,
        };
    });

    // Conflict check — runs BEFORE touching any existing rules; exclude this server's own rules
    const newPorts = Object.values(overrides).map(o => o.port);
    const conflicts = await window.api.invoke('check-port-conflicts', { ports: newPorts, excludeServerName: srv.name });
    console.log(`[RSM] saveFirewallPortOverrides — conflicts:`, conflicts);
    if (conflicts?.length) {
        const names = conflicts.map(c => `Port ${c.port} (${c.protocol}): "${c.ruleName}"`).join('; ');
        window.updateSystemLog(`[RSM] ⚠ Port conflict — the following ports are already claimed by other rules: ${names}. Review before applying.`);
    }

    // If rules are currently active, remove old ones and apply new ones automatically
    const rulesActive = await window.api.invoke('check-firewall-rules', { serverName: srv.name });
    if (rulesActive) {
        const isAdmin = await window.api.invoke('check-admin');
        if (isAdmin) {
            const ports = portDefs.map(def => {
                const ov = overrides[def.id] || {};
                return { id: def.id, label: def.label, port: ov.port ?? def.default, tcp: ov.tcp ?? def.tcp, udp: ov.udp ?? def.udp };
            });
            window.updateSystemLog(`[RSM] Port config changed — removing old rules and applying updated ports for "${srv.name}"...`);
            const result = await window.api.invoke('apply-firewall-rules', { serverName: srv.name, ports });
            if (result.success) {
                window.updateSystemLog(`[RSM] Firewall rules updated for "${srv.name}".`);
                updateFirewallStatus(true);
            } else {
                window.updateSystemLog(`[RSM] Warning: Config saved but rules could not be updated: ${result.error || 'Unknown error'}`);
            }
        } else {
            window.updateSystemLog(`[RSM] Warning: Active rules exist for "${srv.name}" but RSM needs Administrator to update them. Rules may be out of sync with saved ports.`);
        }
    }

    srv.firewallPorts = overrides;
    window.api.send('save-servers', servers);
    window.updateSystemLog(`[RSM] Firewall port config saved for ${srv.name}.`);
};

function updateFirewallStatus(active) {
    const statusEl = document.getElementById('fw-status');
    if (!statusEl) return;
    if (active === null) {
        statusEl.className = 'fw-status fw-status-unknown';
        statusEl.textContent = '';
    } else if (active) {
        statusEl.className = 'fw-status fw-status-active';
        statusEl.textContent = '● Rules Active';
    } else {
        statusEl.className = 'fw-status fw-status-inactive';
        statusEl.textContent = '○ No Rules';
    }
}

async function checkFirewallStatus(srv) {
    console.log(`[RSM] checkFirewallStatus — srv: "${srv.name}"`);
    const statusEl = document.getElementById('fw-status');
    if (statusEl) {
        statusEl.className = 'fw-status fw-status-unknown';
        statusEl.textContent = '● Checking...';
    }
    const isActive = await window.api.invoke('check-firewall-rules', { serverName: srv.name });
    console.log(`[RSM] checkFirewallStatus — result: ${isActive}`);
    serverFirewallStatus[srv.id] = isActive;
    updateFirewallStatus(isActive);
    renderSidebar();
}

window.applyFirewallRules = async function () {
    const srv = servers.find(s => s.id === activeId);
    if (!srv) return;
    console.log(`[RSM] applyFirewallRules — srv: "${srv.name}"`);

    const isAdmin = await window.api.invoke('check-admin');
    console.log(`[RSM] applyFirewallRules — isAdmin: ${isAdmin}`);
    if (!isAdmin) {
        window.updateSystemLog('[RSM] Cannot apply firewall rules: RSM must be run as Administrator.');
        return;
    }

    const config = ServerTypeRegistry[srv.type];
    const portDefs = config?.firewallPorts || [];
    const overrides = srv.firewallPorts || {};
    const ports = portDefs.map(def => {
        const ov = overrides[def.id] || {};
        return { id: def.id, label: def.label, port: ov.port ?? def.default, tcp: ov.tcp ?? def.tcp, udp: ov.udp ?? def.udp };
    });

    window.updateSystemLog(`[RSM] Applying firewall rules for "${srv.name}"...`);
    const result = await window.api.invoke('apply-firewall-rules', { serverName: srv.name, ports });
    console.log(`[RSM] applyFirewallRules — result:`, result);
    if (result.success) {
        window.updateSystemLog(`[RSM] Firewall rules applied for "${srv.name}".`);
        serverFirewallStatus[srv.id] = true;
        updateFirewallStatus(true);
        renderSidebar();
    } else {
        window.updateSystemLog(`[RSM] Failed to apply rules: ${result.error || 'Unknown error'}`);
    }
};

window.removeFirewallRules = async function () {
    const srv = servers.find(s => s.id === activeId);
    if (!srv) return;
    console.log(`[RSM] removeFirewallRules — srv: "${srv.name}"`);

    const isAdmin = await window.api.invoke('check-admin');
    console.log(`[RSM] removeFirewallRules — isAdmin: ${isAdmin}`);
    if (!isAdmin) {
        window.updateSystemLog('[RSM] Cannot remove firewall rules: RSM must be run as Administrator.');
        return;
    }

    window.updateSystemLog(`[RSM] Removing firewall rules for "${srv.name}"...`);
    const result = await window.api.invoke('remove-firewall-rules', { serverName: srv.name });
    console.log(`[RSM] removeFirewallRules — result:`, result);
    if (result.success) {
        window.updateSystemLog(`[RSM] Firewall rules removed for "${srv.name}".`);
        serverFirewallStatus[srv.id] = false;
        updateFirewallStatus(false);
        renderSidebar();
    } else {
        window.updateSystemLog(`[RSM] Failed to remove rules: ${result.error || 'Unknown error'}`);
    }
};


//      ____   ___  ____ _____ ___ _____ ____
//     |  _ \ / _ \|  _ \_   _|_ _| ____|  _ \
//     | |_) | | | | |_) || |  | ||  _| | |_) |
//     |  __/| |_| |  _ < | |  | || |___|  _ <
//     |_|    \___/|_| \_\|_| |___|_____|_| \_\
//

function updatePortierNavBadge(state) {
    const badge = document.getElementById('portier-nav-badge');
    if (!badge) return;
    badge.className = `portier-nav-badge badge-${state}`;
    badge.title = {
        active:   'Firewall rules are active',
        inactive: 'Ports configured — rules not yet applied',
        none:     'No firewall ports configured'
    }[state] || '';
}

function portierLog(msg) {
    const log = document.getElementById('portier-log');
    if (!log) return;
    const now = new Date();
    const ts = now.toLocaleTimeString('en-GB', { hour12: false });
    const line = document.createElement('div');
    line.textContent = `[${ts}] ${msg}`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

async function loadPortierView() {
    const list       = document.getElementById('portier-rules-list');
    const count      = document.getElementById('portier-rule-count');
    const adminBadge = document.getElementById('portier-admin-badge');
    if (!list) return;

    list.innerHTML = '<span class="portier-empty">Loading...</span>';
    if (count) count.textContent = '—';

    const isAdmin = await window.api.invoke('check-admin');
    console.log('[Portier] loadPortierView — isAdmin:', isAdmin);
    if (adminBadge) {
        adminBadge.textContent = isAdmin ? '● Admin' : '○ Not Admin';
        adminBadge.className = `portier-admin-badge ${isAdmin ? 'admin-yes' : 'admin-no'}`;
    }
    const addBtn      = document.querySelector('.portier-add-btn');
    const applyAllBtn = document.querySelector('.portier-apply-all-btn');
    if (addBtn)      addBtn.disabled      = !isAdmin;
    if (applyAllBtn) applyAllBtn.disabled = !isAdmin;
    console.log('[Portier] addBtn found:', !!addBtn, '| disabled:', addBtn?.disabled);

    const rules = await window.api.invoke('get-firewall-rules');

    if (!rules || !rules.length) {
        list.innerHTML = '<span class="portier-empty">No managed rules found.</span>';
        if (count) count.textContent = '0 rules';
        return;
    }

    if (count) count.textContent = `${rules.length} rule${rules.length !== 1 ? 's' : ''}`;
    list.innerHTML = '';

    rules.forEach(rule => {
        const enabled  = rule.enabled === 'True';
        const safeName = rule.name.replace(/'/g, "\\'");
        const row = document.createElement('div');
        row.className = 'portier-rule-row';
        row.innerHTML = `
            <span class="portier-rule-name" title="${rule.name}">${rule.name}</span>
            <span class="portier-rule-pill portier-rule-proto">${rule.protocol || '—'}</span>
            <span class="portier-rule-pill portier-rule-port">${rule.port || '—'}</span>
            <button class="portier-toggle-btn ${enabled ? 'toggle-on' : 'toggle-off'}" ${!isAdmin ? 'disabled' : ''} onclick="togglePortierRule('${safeName}', ${enabled})">${enabled ? 'Enabled' : 'Disabled'}</button>
            <button class="btn btn-outline portier-remove-btn" ${!isAdmin ? 'disabled' : ''} onclick="removePortierRule('${safeName}')">Remove</button>`;
        list.appendChild(row);
    });
}

window.togglePortierRule = async function (displayName, currentlyEnabled) {
    console.log(`[Portier] togglePortierRule — displayName: "${displayName}" | currentlyEnabled: ${currentlyEnabled}`);
    const isAdmin = await window.api.invoke('check-admin');
    if (!isAdmin) { portierLog('Error: RSM must be run as Administrator to manage firewall rules.'); return; }

    const newState = !currentlyEnabled;
    portierLog(`${newState ? 'Enabling' : 'Disabling'} rule "${displayName}"...`);
    const result = await window.api.invoke('toggle-firewall-rule', { displayName, enabled: newState });
    console.log(`[Portier] togglePortierRule — result:`, result);

    if (result.success) {
        portierLog(`Rule "${displayName}" ${newState ? 'enabled' : 'disabled'}.`);
        await loadPortierView();
    } else {
        portierLog(`Failed to toggle rule: ${result.error || 'Unknown error'}`);
    }
};

window.applyAllServerRules = async function () {
    console.log('[Portier] applyAllServerRules — called');
    const isAdmin = await window.api.invoke('check-admin');
    if (!isAdmin) { portierLog('Error: RSM must be run as Administrator to manage firewall rules.'); return; }

    const targets = servers.filter(s => {
        const portDefs = ServerTypeRegistry[s.type]?.firewallPorts;
        return portDefs && portDefs.length > 0;
    });

    if (!targets.length) {
        portierLog('No servers with configured firewall ports found.');
        return;
    }
    console.log(`[Portier] applyAllServerRules — targets: ${targets.length}`);

    portierLog(`Applying firewall rules for ${targets.length} server${targets.length !== 1 ? 's' : ''}...`);
    let ok = 0, fail = 0;
    for (const srv of targets) {
        const config   = ServerTypeRegistry[srv.type];
        const portDefs = config.firewallPorts;
        const overrides = srv.firewallPorts || {};
        const ports = portDefs.map(def => {
            const ov = overrides[def.id] || {};
            return { id: def.id, label: def.label, port: ov.port ?? def.default, tcp: ov.tcp ?? def.tcp, udp: ov.udp ?? def.udp };
        });
        portierLog(`  → ${srv.name}...`);
        const result = await window.api.invoke('apply-firewall-rules', { serverName: srv.name, ports });
        if (result.success) {
            ok++;
            serverFirewallStatus[srv.id] = true;
        } else {
            fail++;
            portierLog(`    Failed: ${result.error || 'Unknown error'}`);
        }
    }
    portierLog(`Done — ${ok} succeeded${fail > 0 ? `, ${fail} failed` : ''}.`);
    renderSidebar();
    await loadPortierView();
};

window.addCustomRule = async function () {
    console.log('[Portier] addCustomRule called');
    const nameEl = document.getElementById('portier-rule-name');
    const portEl = document.getElementById('portier-rule-port');
    const tcp    = document.getElementById('portier-tcp')?.checked;
    const udp    = document.getElementById('portier-udp')?.checked;
    const addBtn = document.querySelector('.portier-add-btn');

    const displayName = nameEl?.value.trim();
    const port = parseInt(portEl?.value, 10);
    console.log('[Portier] addCustomRule — name:', displayName, '| port:', port, '| tcp:', tcp, '| udp:', udp);

    if (!displayName) { portierLog('Error: A display name is required.'); return; }
    if (!port || port < 1 || port > 65535) { portierLog('Error: Enter a valid port (1–65535).'); return; }
    if (!tcp && !udp) { portierLog('Error: Select at least one protocol (TCP or UDP).'); return; }

    const isAdmin = await window.api.invoke('check-admin');
    console.log('[Portier] addCustomRule — isAdmin:', isAdmin);
    if (!isAdmin) { portierLog('Error: RSM must be run as Administrator to manage firewall rules.'); return; }

    // Reset acknowledgement if the port changed since the warning was shown
    if (window._portierAddConflictPort !== port) {
        window._portierAddConflictAcknowledged = false;
        if (addBtn) addBtn.textContent = '+ Add Rule';
    }

    // Conflict check — skip if user already clicked through the warning for this port
    if (!window._portierAddConflictAcknowledged) {
        const conflicts = await window.api.invoke('check-port-conflicts', { ports: [port] });
        console.log('[Portier] addCustomRule — conflicts:', conflicts);
        if (conflicts?.length) {
            const names = conflicts.map(c => `Port ${c.port} (${c.protocol}): "${c.ruleName}"`).join('; ');
            portierLog(`⚠ Port conflict — ${names}. Click Add Anyway to proceed.`);
            window._portierAddConflictAcknowledged = true;
            window._portierAddConflictPort = port;
            if (addBtn) addBtn.textContent = 'Add Anyway';
            return;
        }
    }
    window._portierAddConflictAcknowledged = false;
    window._portierAddConflictPort = null;
    if (addBtn) addBtn.textContent = '+ Add Rule';

    portierLog(`Adding rule "${displayName}" on port ${port}${tcp ? ' TCP' : ''}${udp ? ' UDP' : ''}...`);
    const result = await window.api.invoke('add-firewall-rule', { displayName, port, tcp, udp });
    console.log('[Portier] addCustomRule — add-firewall-rule result:', result);

    if (result.success) {
        portierLog(`Rule "${displayName}" added successfully.`);
        if (nameEl) nameEl.value = '';
        if (portEl) portEl.value = '';
        await loadPortierView();
    } else {
        portierLog(`Failed to add rule: ${result.error || 'Unknown error'}`);
    }
};

window.removePortierRule = async function (displayName) {
    const isAdmin = await window.api.invoke('check-admin');
    if (!isAdmin) { portierLog('Error: RSM must be run as Administrator to manage firewall rules.'); return; }

    portierLog(`Removing rule "${displayName}"...`);
    const result = await window.api.invoke('remove-firewall-rule', { displayName });

    if (result.success) {
        portierLog(`Rule "${displayName}" removed.`);
        await loadPortierView(); // badge updated inside loadPortierView
    } else {
        portierLog(`Failed to remove rule: ${result.error || 'Unknown error'}`);
    }
};


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

    DebugLog(`Menu opened for server: ${srvId}`);
};

window.deleteServer = (id) => {
    const idToRemove = id || targetId;

    if (!idToRemove) {
        console.error("[RSM-ERROR] No ID found to delete.");
        return;
    }

    DebugLog(`Delete server attempt for ID: ${idToRemove}`);

    if (confirm("Are you sure you want to delete this server? This cannot be undone.")) {
        const originalLength = servers.length;
        servers = servers.filter(s => s.id.toString() !== idToRemove.toString());

        if (servers.length < originalLength) {
            window.api.send('save-servers', servers);

            if (activeId === idToRemove) {
                window.showView('home');
            }

            renderSidebar();
            DebugLog(`Server with ID ${idToRemove} successfully deleted.`);
        } else {
            console.warn("[RSM-WARN] No server found with that ID to delete.");
        }
    }
};

window.openEditModal = (serverId) => {
    DebugLog(`openEditModal triggered with ID: ${serverId}`);

    if (!serverId) {
        console.error("[RSM-ERROR] No serverId passed to the function!");
        return;
    }

    const srv = servers.find(s => s.id.toString() === serverId.toString());

    if (!srv) {
        console.error("[RSM-ERROR] Could not find server in the list. Available IDs:", servers.map(s => s.id));
        return;
    }
    DebugLog(`Server found: ${srv.name} | Type: ${srv.type}`);

    window.editingServerId = srv.id;
    const type = srv.type || 'other';
    window.selectedType = type;
    DebugLog(`State set — editingServerId: ${window.editingServerId} | type: ${type}`);

    DebugLog(`Calling selectServerType...`);
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
                DebugLog(`Field '${id}' not found in DOM (normal if not shown for this server type)`);
            }
        });
        // Pre-fill wizard fw port inputs with server's saved overrides (if any)
        if (srv.firewallPorts) {
            const fwRows = document.getElementById('wizard-fw-ports-rows');
            if (fwRows) {
                Object.entries(srv.firewallPorts).forEach(([id, ov]) => {
                    const input = fwRows.querySelector(`.wizard-fw-input[data-id="${id}"]`);
                    if (input && ov.port) input.value = ov.port;
                });
            }
        }

        DebugLog(`All form fields populated.`);
    } catch (err) {
        console.error("[RSM-ERROR] Failed to fill form fields:", err);
    }

    const modalEl = document.getElementById('modal');
    if (modalEl) {
        DebugLog(`Modal element found, setting display to flex...`);
        modalEl.style.display = 'flex';

        if (typeof window.showWizardStep === 'function') {
            DebugLog(`Switching to Wizard Step 2...`);
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
        console.log(`[RSM] startServer — "${srv.name}" (id: ${srv.id} | type: ${srv.type})`);
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
        console.log(`[RSM] stopServer — "${srv.name}" (id: ${srv.id} | pid: ${srv.pid || 'none'})`);
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
            console.log(`[RSM] killServer — "${srv.name}" | PID: ${srv.pid}`);
            window.updateSystemLog(`Force killing server "${srv.name}"...`);
            window.api.send('kill-server', srv.pid);
        }
    }
};

// Starts or stops ALL servers from the sidebar global action buttons
window.globalAction = (action) => {
    const targets = servers.filter(s => action === 'start' ? s.status !== 'Online' : s.status === 'Online');
    console.log(`[RSM] globalAction — action: "${action}" | targets: ${targets.length}`);
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
            console.log(`[RSM] sendConsoleCommand — srv: "${srv?.name || activeId}" | command: "${command}"`);
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
    console.log(`[RSM] sendQuickAction — srv: "${srv?.name || activeId}" | command: "${command}"`);
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
    console.log(`[RSM] startStatusDashboard — srvId: ${srvId}`);
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
    console.log('[RSM] stopStatusDashboard — clearing uptime and player poll intervals');
    if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null; }
    if (playerPollInterval) { clearInterval(playerPollInterval); playerPollInterval = null; }
    uptimeStart = null;

    document.getElementById('stat-players').innerText = '— / —';
    document.getElementById('stat-uptime').innerText = '—';
    document.getElementById('stat-connections').innerText = '—';
    connHistory = new Array(CONN_HISTORY_LEN).fill(null);
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
    if (!srv) { console.warn(`[RSM] console-out — unknown server id: ${data.id}`); return; }

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
    console.log(`[RSM] status-change — id: ${data.id} | status: ${data.status} | pid: ${data.pid || 'none'}`);
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
    const srv = servers.find(s => s.id === data.id);
    if (!srv) return;

    srv.ramMB = data.ramRaw;

    if (activeId === data.id) {
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

window.api.receive('server-connections-update', ({ id, connections }) => {
    if (id !== activeId) return;
    connHistory.push(connections);
    connHistory.shift();
    drawConnectionsGraph();
});

function drawConnectionsGraph() {
    const canvas = document.getElementById('connections-graph');
    if (!canvas) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    if (W === 0 || H === 0) return;

    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // Only draw points that have data (non-null)
    const known = connHistory.filter(v => v !== null);
    const maxVal = known.length > 0 ? Math.max(...known, 1) : 1;

    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#007bff';

    // Build point list — skip leading nulls
    const pts = [];
    for (let i = 0; i < connHistory.length; i++) {
        if (connHistory[i] === null) continue;
        pts.push({
            x: (i / (connHistory.length - 1)) * W,
            y: H - (connHistory[i] / maxVal) * (H - 8) - 4
        });
    }

    const current = [...connHistory].reverse().find(v => v !== null);
    const el = document.getElementById('stat-connections');
    if (el) el.textContent = current ?? '—';

    if (pts.length < 2) return;

    // Filled area — strong alpha; CSS opacity on the canvas element fades it overall
    ctx.beginPath();
    ctx.moveTo(pts[0].x, H);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, H);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,123,255,0.55)';
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
}

window.api.receive('network-stats-update', ({ rxSec, txSec }) => {
    netRxHistory.push(rxSec);
    netRxHistory.shift();
    netTxHistory.push(txSec);
    netTxHistory.shift();
    drawNetworkGraph();
});

function formatBytesPerSec(bps) {
    if (bps < 1024) return `${Math.round(bps)} B/s`;
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    return `${(bps / 1048576).toFixed(2)} MB/s`;
}

function drawNetworkGraph() {
    const canvas = document.getElementById('network-graph');
    if (!canvas) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    if (W === 0 || H === 0) return;

    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // Faint horizontal grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        const y = Math.round((H * i) / 4) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }

    const maxVal = Math.max(...netRxHistory, ...netTxHistory, 1024);
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#007bff';

    const drawLine = (history, color, fill) => {
        if (history.length < 2) return;
        const pts = history.map((v, i) => ({
            x: (i / (history.length - 1)) * W,
            y: H - (v / maxVal) * (H - 4) - 2
        }));

        // Filled area under line
        ctx.beginPath();
        ctx.moveTo(pts[0].x, H);
        pts.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(pts[pts.length - 1].x, H);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();

        // Line stroke
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
    };

    drawLine(netTxHistory, '#4a9eff', 'rgba(74,158,255,0.08)');
    drawLine(netRxHistory, accentColor, 'rgba(0,123,255,0.10)');

    const rxEl = document.getElementById('net-rx-val');
    const txEl = document.getElementById('net-tx-val');
    if (rxEl) rxEl.textContent = formatBytesPerSec(netRxHistory[netRxHistory.length - 1]);
    if (txEl) txEl.textContent = formatBytesPerSec(netTxHistory[netTxHistory.length - 1]);
}


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

function resetWizardSaveBtn() {
    const btn = document.getElementById('wizard-save-btn');
    if (btn) { btn.textContent = 'Save Configuration'; btn.onclick = () => saveNewServer(); }
}

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
    window._fwConflictsAcknowledged = false;
    const fwBlock = document.getElementById('wizard-fw-ports-block');
    if (fwBlock) fwBlock.style.display = 'none';
    const fwBanner = document.getElementById('wizard-fw-conflict-banner');
    if (fwBanner) fwBanner.style.display = 'none';
    resetWizardSaveBtn();
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

    // Populate wizard firewall ports section
    const fwBlock = document.getElementById('wizard-fw-ports-block');
    const fwRows  = document.getElementById('wizard-fw-ports-rows');
    const fwBanner = document.getElementById('wizard-fw-conflict-banner');
    if (fwBlock && fwRows) {
        const portDefs = config.firewallPorts;
        if (portDefs?.length) {
            fwRows.innerHTML = '';
            portDefs.forEach(def => {
                const protos = [def.tcp && 'TCP', def.udp && 'UDP'].filter(Boolean).join(' / ');
                const row = document.createElement('div');
                row.className = 'wizard-fw-row';
                row.innerHTML = `
                    <span class="fw-port-label">${def.label}</span>
                    <input class="fw-port-input wizard-fw-input" type="number" min="1" max="65535"
                           value="${def.default}" data-id="${def.id}" />
                    <span class="wizard-fw-proto">${protos}</span>
                    <span class="fw-port-desc">${def.description || ''}</span>`;
                fwRows.appendChild(row);
            });
            fwBlock.style.display = 'block';
        } else {
            fwBlock.style.display = 'none';
        }
    }
    if (fwBanner) fwBanner.style.display = 'none';
    resetWizardSaveBtn();

    window.showWizardStep(2);
};

window.goBackToStep1 = () => {
    window.showWizardStep(1);
};

window.openActiveFolder = () => {
    window.openServerFolder(activeId);
};

// Adds a new server or updates an existing one in the servers list
window.saveNewServer = async () => {
    const name = document.getElementById('newName').value;
    const path = document.getElementById('exePath').value;
    const type = window.selectedType || "other";
    console.log(`[RSM] saveNewServer — name: "${name}" | type: "${type}" | editingId: ${window.editingServerId || 'new'}`);
    const config = ServerTypeRegistry[type] || {};
    const category = config.backend?.category ?? "DIRECT_CONSOLE";
    const playerListCommand = config.backend?.playerListCommand ?? null;

    const apiPort = document.getElementById('portId').value || "8080";
    const apiPass = document.getElementById('portPass').value || "";
    const args = document.getElementById('customArgs').value || "";
    const workingDir = document.getElementById('workingDir').value || "";
    const logPath = document.getElementById('logPath').value || "";
    const mcRam = document.getElementById('mcRam')?.value || "";
    const seInstance = document.getElementById('seInstance')?.value || "";

    if (!name || !path) return alert("Please provide a name and select an executable.");

    // Collect wizard firewall port overrides
    const portDefs = config.firewallPorts || [];
    let firewallPorts = undefined;
    if (portDefs.length) {
        firewallPorts = {};
        portDefs.forEach(def => {
            const input = document.querySelector(`#wizard-fw-ports-rows .wizard-fw-input[data-id="${def.id}"]`);
            firewallPorts[def.id] = {
                port: parseInt(input?.value, 10) || def.default,
                tcp: def.tcp,
                udp: def.udp
            };
        });
    }

    // Port conflict check — skip if user has already acknowledged the warning
    if (!window._fwConflictsAcknowledged && firewallPorts) {
        const portsToCheck = Object.values(firewallPorts).map(o => o.port);
        // When editing an existing server, exclude its own rules (they'll be replaced on apply)
        const existingName = window.editingServerId
            ? servers.find(s => s.id.toString() === window.editingServerId.toString())?.name
            : null;
        const conflicts = await window.api.invoke('check-port-conflicts', { ports: portsToCheck, excludeServerName: existingName });
        console.log(`[RSM] saveNewServer — conflicts:`, conflicts);
        if (conflicts?.length) {
            const banner = document.getElementById('wizard-fw-conflict-banner');
            if (banner) {
                const items = conflicts.map(c => `<li>Port ${c.port} (${c.protocol}) — already used by: <em>${c.ruleName}</em></li>`).join('');
                banner.innerHTML = `<strong>⚠ Port Conflict Detected</strong><br>
                    The following ports are already claimed by existing Windows Firewall rules. Opening them may conflict with another service:<ul>${items}</ul>
                    <span style="opacity:0.75;font-size:11px;">Adjust the ports above, or click <strong>Save Anyway</strong> to proceed.</span>`;
                banner.style.display = 'block';
            }
            const btn = document.getElementById('wizard-save-btn');
            if (btn) { btn.textContent = 'Save Anyway'; btn.onclick = () => { window._fwConflictsAcknowledged = true; window.saveNewServer(); }; }
            return;
        }
    }

    // Reset conflict state for next open
    window._fwConflictsAcknowledged = false;

    if (window.editingServerId) {
        const index = servers.findIndex(s => s.id.toString() === window.editingServerId.toString());
        if (index !== -1) {
            const existing = servers[index];
            servers[index] = {
                ...existing,
                name, path, apiPort, apiPass, args, logPath, workingDir, mcRam, seInstance, type, category, playerListCommand,
                ...(firewallPorts && { firewallPorts })
            };
            if (DebugActive) {
                window.updateSystemLog(`---Saving server ${name} with the following settings---`);
                window.updateSystemLog(`Name: ${name}\nType: ${type}\nPath: ${path}\nPort: ${apiPort}\nAPI Pass: ${apiPass}\nLogPath: ${logPath}\nWorking Directory: ${workingDir}\nArgs: ${args}`);
            }
        }
    } else {
        servers.push({
            id: Date.now().toString(),
            type, category, playerListCommand, name, path, apiPort, apiPass, mcRam, seInstance,
            args, logPath, workingDir,
            status: 'Offline', logs: '', pid: null,
            ...(firewallPorts && { firewallPorts })
        });
    }

    window.api.send('save-servers', servers);
    console.log(`[RSM] saveNewServer — server saved: "${name}"`);
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
        window.updateSystemLog(`Background opacity adjusted to ${Math.round(value * 100)}%`);
    }
};

window.updateWindowOpacity = (value) => {
    const parsed = parseFloat(value);
    window.api.send('update-window-opacity', parsed);

    const label = document.getElementById('win-opacity-label');
    if (label) label.innerText = Math.round(parsed * 100) + '%';

    localStorage.setItem('preferred-win-opacity', value);
    window.updateSystemLog(`Window opacity adjusted to ${Math.round(parsed * 100)}%`);
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
let cfgBackupDir = localStorage.getItem('cfg-backup-dir') || '';
let cfgIsDirty = false;

function updateCfgDirtyState() {
    const btn = document.getElementById('cfg-discard-btn');
    if (btn) btn.disabled = !cfgIsDirty;
    const activeTab = document.querySelector('.cfg-tab.active');
    if (activeTab) activeTab.classList.toggle('cfg-tab-dirty', cfgIsDirty);
}

function updateCfgCursorPos() {
    const editor = document.getElementById('cfg-editor');
    const posEl = document.getElementById('cfg-cursor-pos');
    if (!editor || !posEl) return;
    const text = editor.value.substring(0, editor.selectionStart);
    const lines = text.split('\n');
    posEl.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
}

window.openConfigFileFolder = () => {
    if (!cfgCurrentFilePath) return;
    window.api.send('open-folder', cfgCurrentFilePath.replace(/[^/\\]+$/, ''));
};

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
    console.log(`[RSM] openConfigEditor — srv: "${srv.name}" | type: ${srv.type}`);
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

    if (cfgIsDirty && !confirm('You have unsaved changes. Discard them and switch tabs?')) return;

    const tabs = document.querySelectorAll('.cfg-tab');
    tabs.forEach((t, i) => t.classList.toggle('active', i === index));

    cfgActiveTabIndex = index;
    await loadCfgTab(srv, index);
}

async function loadCfgTab(srv, index) {
    console.log(`[RSM] loadCfgTab — srv: "${srv.name}" | index: ${index}`);
    const config = ServerTypeRegistry[srv.type];
    const fileEntry = config.gameFiles.configs[index];
    cfgCurrentFilePath = resolveCfgPath(srv, fileEntry);

    document.getElementById('cfg-file-path').textContent = cfgCurrentFilePath;
    document.getElementById('cfg-save-status').textContent = '';
    document.getElementById('cfg-save-status').classList.remove('visible');

    const result = await window.api.invoke('read-config-file', cfgCurrentFilePath);
    console.log(`[RSM] loadCfgTab — read result: success=${result.success}`);
    const editor = document.getElementById('cfg-editor');

    if (result.success) {
        editor.value = result.content;
        cfgOriginalContent = result.content;
    } else {
        editor.value = `// Could not read file:\n// ${result.error}`;
        cfgOriginalContent = '';
    }

    cfgIsDirty = false;
    updateCfgDirtyState();
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
    const srv = servers.find(s => s.id === activeId);
    const editor = document.getElementById('cfg-editor');
    const content = editor.value;
    const statusEl = document.getElementById('cfg-save-status');
    console.log(`[RSM] saveConfigFile — filePath: "${cfgCurrentFilePath}"`);

    const result = await window.api.invoke('write-config-file', {
        filePath: cfgCurrentFilePath,
        content,
        backupDir: cfgBackupDir || null,
        serverType: srv?.type || null,
        serverName: srv?.name || null
    });

    console.log(`[RSM] saveConfigFile — result: success=${result.success} | backedUp=${result.backedUp}`);
    if (result.success) {
        cfgOriginalContent = content;
        cfgIsDirty = false;
        updateCfgDirtyState();
        if (result.backedUp) {
            statusEl.textContent = '✓ Saved  ·  backup created';
            statusEl.style.color = 'var(--success)';
        } else if (result.backupError) {
            statusEl.textContent = `✓ Saved  ·  backup failed: ${result.backupError}`;
            statusEl.style.color = '#f59e0b';
        } else {
            statusEl.textContent = '✓ Saved';
            statusEl.style.color = 'var(--success)';
        }
        statusEl.classList.add('visible');
        setTimeout(() => statusEl.classList.remove('visible'), 2500);
    } else {
        statusEl.textContent = `✗ Save failed: ${result.error}`;
        statusEl.style.color = 'var(--danger)';
        statusEl.classList.add('visible');
    }
};

window.discardConfigChanges = () => {
    console.log('[RSM] discardConfigChanges — reverting editor to original content');
    const editor = document.getElementById('cfg-editor');
    editor.value = cfgOriginalContent;
    cfgIsDirty = false;
    updateCfgDirtyState();
    updateCfgLineNumbers();
    const statusEl = document.getElementById('cfg-save-status');
    statusEl.classList.remove('visible');
};

window.closeConfigEditor = () => {
    console.log(`[RSM] closeConfigEditor — dirty: ${cfgIsDirty}`);
    if (cfgIsDirty && !confirm('You have unsaved changes. Close without saving?')) return;
    cfgIsDirty = false;
    updateCfgDirtyState();
    document.getElementById('config-modal').style.display = 'none';
};

window.browseBackupFolder = async () => {
    console.log('[RSM] browseBackupFolder — opening folder picker');
    const selected = await window.api.invoke('select-folder');
    if (!selected) { console.log('[RSM] browseBackupFolder — cancelled'); return; }
    console.log(`[RSM] browseBackupFolder — selected: "${selected}"`);
    cfgBackupDir = selected;
    localStorage.setItem('cfg-backup-dir', cfgBackupDir);
    const el = document.getElementById('backup-folder-input');
    if (el) el.value = cfgBackupDir;
};

window.openRestoreBackup = async () => {
    const srv = servers.find(s => s.id === activeId);
    if (!srv || !cfgCurrentFilePath || !cfgBackupDir) return;

    const fileName = cfgCurrentFilePath.split(/[/\\]/).pop();
    console.log(`[RSM] openRestoreBackup — srv: "${srv.name}" | file: "${fileName}"`);

    const result = await window.api.invoke('list-backups', {
        backupDir: cfgBackupDir,
        serverType: srv.type,
        serverName: srv.name,
        fileName
    });

    const listEl  = document.getElementById('restore-backup-list');
    const emptyEl = document.getElementById('restore-backup-empty');
    listEl.innerHTML = '';

    if (!result.backups?.length) {
        emptyEl.style.display = 'block';
        listEl.style.display  = 'none';
    } else {
        emptyEl.style.display = 'none';
        listEl.style.display  = 'block';
        result.backups.forEach(b => {
            const item = document.createElement('button');
            item.className = 'restore-backup-item';
            const ts = b.name.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})\.bak$/);
            item.textContent = ts ? `${ts[1]}  ${ts[2]}:${ts[3]}:${ts[4]}` : b.name;
            item.onclick = () => window.loadBackupIntoEditor(b.path);
            listEl.appendChild(item);
        });
    }

    document.getElementById('restore-backup-modal').style.display = 'flex';
};

window.loadBackupIntoEditor = async (backupPath) => {
    console.log(`[RSM] loadBackupIntoEditor — path: "${backupPath}"`);
    const result = await window.api.invoke('read-config-file', backupPath);
    if (!result.success) {
        console.error(`[RSM] loadBackupIntoEditor — failed to read backup: ${result.error}`);
        alert(`Could not read backup: ${result.error}`);
        return;
    }
    console.log('[RSM] loadBackupIntoEditor — backup loaded into editor, awaiting save');
    const editor = document.getElementById('cfg-editor');
    editor.value = result.content;
    cfgIsDirty = true;
    updateCfgDirtyState();
    updateCfgLineNumbers();
    const statusEl = document.getElementById('cfg-save-status');
    statusEl.textContent = '↩ Backup loaded — review and Save to apply';
    statusEl.style.color = '#f59e0b';
    statusEl.classList.add('visible');
    document.getElementById('restore-backup-modal').style.display = 'none';
};

window.closeRestoreBackup = () => {
    document.getElementById('restore-backup-modal').style.display = 'none';
};


//        _    ____  ___   ____  _____ _____ _____ ___ _   _  ____ ____
//       / \  |  _ \|_ _| / ___|| ____|_   _|_   _|_ _| \ | |/ ___/ ___|
//      / _ \ | |_) || |  \___ \|  _|   | |   | |  | ||  \| | |  _\___ \
//     / ___ \|  __/ | |   ___) | |___  | |   | |  | || |\  | |_| |___) |
//    /_/   \_\_|   |___| |____/|_____| |_|   |_| |___|_| \_|\____|____/
//

let _apiConfig = { enabled: false, port: 3002, apiKey: '' };

async function loadApiSettings() {
    console.log('[RSM] loadApiSettings — loading...');
    try {
        _apiConfig = await window.api.invoke('get-api-config');
        console.log('[RSM] loadApiSettings — loaded:', { enabled: _apiConfig.enabled, port: _apiConfig.port });
    } catch (e) {
        _apiConfig = { enabled: false, port: 3002, apiKey: '' };
    }
    const enabledChk = document.getElementById('api-enabled-chk');
    const portInput  = document.getElementById('api-port-input');
    const keyDisplay = document.getElementById('api-key-display');
    if (enabledChk) enabledChk.checked   = !!_apiConfig.enabled;
    if (portInput)  portInput.value       = String(_apiConfig.port || 3002);
    if (keyDisplay) keyDisplay.value      = _apiConfig.apiKey || '(none — click Regenerate)';
    _updateApiBodyOpacity(_apiConfig.enabled);
}

function _updateApiBodyOpacity(enabled) {
    const body = document.getElementById('api-settings-body');
    if (body) {
        body.style.opacity       = enabled ? '1' : '0.5';
        body.style.pointerEvents = enabled ? '' : 'none';
    }
}

window.toggleApiEnabled = (enabled) => {
    console.log(`[RSM] toggleApiEnabled — enabled: ${enabled}`);
    _apiConfig.enabled = enabled;
    window.api.send('save-api-config', _apiConfig);
    _updateApiBodyOpacity(enabled);
    window.updateSystemLog(`Remote API ${enabled ? 'enabled on port ' + (_apiConfig.port || 3002) : 'disabled'}.`);
};

window.saveApiPort = () => {
    const input = document.getElementById('api-port-input');
    const port  = parseInt(input?.value) || 3002;
    console.log(`[RSM] saveApiPort — port: ${port}`);
    _apiConfig.port = port;
    window.api.send('save-api-config', _apiConfig);
    window.updateSystemLog(`API port set to ${port}.`);
};

window.copyApiKey = () => {
    const key = _apiConfig.apiKey;
    if (!key) return;
    navigator.clipboard.writeText(key).catch(() => {
        const el = document.getElementById('api-key-display');
        if (el) { el.select(); document.execCommand('copy'); }
    });
    window.updateSystemLog('API key copied to clipboard.');
};

window.regenerateApiKey = async () => {
    console.log('[RSM] regenerateApiKey — requesting...');
    const newConfig = await window.api.invoke('regenerate-api-key');
    console.log('[RSM] regenerateApiKey — done');
    _apiConfig = newConfig;
    const keyDisplay = document.getElementById('api-key-display');
    if (keyDisplay) keyDisplay.value = newConfig.apiKey;
    window.updateSystemLog('API key regenerated. Update your external tools with the new key.');
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

// Wire up config editor: line numbers, dirty tracking, Ctrl+S, cursor pos, Esc, scroll sync
document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('cfg-editor');
    const lineNumbers = document.getElementById('cfg-line-numbers');
    if (!editor || !lineNumbers) return;

    editor.addEventListener('input', () => {
        updateCfgLineNumbers();
        if (!cfgIsDirty) {
            cfgIsDirty = true;
            updateCfgDirtyState();
        }
    });
    editor.addEventListener('scroll', () => {
        lineNumbers.scrollTop = editor.scrollTop;
    });
    editor.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            window.saveConfigFile();
        }
    });
    editor.addEventListener('click', updateCfgCursorPos);
    editor.addEventListener('keyup', updateCfgCursorPos);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const restoreModal = document.getElementById('restore-backup-modal');
            if (restoreModal && restoreModal.style.display === 'flex') { window.closeRestoreBackup(); return; }
            const modal = document.getElementById('config-modal');
            if (modal && modal.style.display === 'flex') window.closeConfigEditor();
        }
    });
});
