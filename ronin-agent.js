'use strict';

// Ronin Citadel Agent — maintains an outbound WSS tunnel to the portal gateway.
// Wired into RSM the same way api-server.js is: call init() with injected deps,
// then start() / stop() to connect / disconnect.

const crypto = require('crypto');
const fs     = require('fs');

// ── Injected dependencies ──────────────────────────────────────────────────
let _getManagedServers;
let _getActiveProcesses;
let _getServerStats;
let _getMainWindow;
let _ipcMain;
let _getAppVersion;
let _app;
// Firewall helpers (shared with api-server.js) — used by the portal firewall relay.
let _getFirewallRules;
let _addFirewallRule;
let _removeFirewallRule;
let _toggleFirewallRule;

// ── Runtime state ──────────────────────────────────────────────────────────
let _ws          = null;
let _portalUrl   = '';
let _agentToken  = '';
let _orgSlug     = '';
let _machSlug    = '';
let _retryDelay  = 1000;
let _retryTimer  = null;
let _pingTimer   = null;
let _stopping    = false;
let _status      = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'

const MAX_RETRY  = 60_000;

// ── Public interface ───────────────────────────────────────────────────────

function init(deps) {
    _getManagedServers  = deps.getManagedServers;
    _getActiveProcesses = deps.getActiveProcesses;
    _getServerStats     = deps.getServerStats;
    _getMainWindow      = deps.getMainWindow;
    _ipcMain            = deps.ipcMain;
    _getAppVersion      = deps.getAppVersion || (() => '?');
    _app                = deps.app;
    // Optional firewall helpers — when absent, the firewall relay returns a clear error.
    _getFirewallRules   = deps.getFirewallRules    || null;
    _addFirewallRule    = deps.addFirewallRule      || null;
    _removeFirewallRule = deps.removeFirewallRule   || null;
    _toggleFirewallRule = deps.toggleFirewallRule   || null;
}

function start(portalUrl, agentToken, citadelApiUrl, orgSlug, machSlug) {
    _stopping    = false;
    // A pending reconnect timer from the previous configuration would fire a
    // second _connect() alongside the one below.
    _clearTimers();
    _portalUrl   = (portalUrl  || '').trim();
    _agentToken  = (agentToken || '').trim();
    _orgSlug     = (orgSlug    || '').trim();
    _machSlug    = (machSlug   || '').trim();
    // Game-library REST calls use citadelApiUrl when provided, else the portal URL.
    setApiBase(citadelApiUrl || portalUrl);

    if (!_portalUrl || !_agentToken || !_orgSlug || !_machSlug) {
        console.warn('[Citadel] Cannot start: portalUrl, agentToken, orgSlug, or machSlug not set');
        return;
    }

    _connect();
}

function stop() {
    _stopping = true;
    _clearTimers();
    if (_ws) {
        try { _ws.close(1000, 'RSM shutdown'); } catch {}
        _ws = null;
    }
    _setStatus('disconnected');
}

function isConnected() {
    return _status === 'connected';
}

// Lets the renderer pull the current status on demand -- covers the case
// where it registers its 'citadel-status' listener after _connect() has
// already pushed one or more status changes (the agent starts synchronously
// in app.whenReady(), well before the renderer's script has finished loading
// and attached its IPC listener, so early pushes are simply missed).
function getStatus() {
    return _status;
}

// Called by main.js whenever a server's status changes (Online / Offline).
// Pushes the update to the portal immediately if connected.
function notifyStatusChange(serverId, status, pid) {
    _send({ type: 'status_update', serverId, status, pid: pid || null });
}

// Called by main.js on every perf tick so the portal gets live CPU/RAM.
function notifyPerfUpdate(serverId, cpu, ramMB) {
    _send({ type: 'perf_update', serverId, cpu, ramMB });
}

// Called by main.js for each line of server console output so the portal's SSE
// console panel can stream it live. No-op when disconnected.
function notifyConsoleOutput(serverId, line) {
    if (!_ws || _ws.readyState !== _ws.OPEN) return;
    _send({ type: 'console_output', serverId, line });
}

// ── Connection logic ───────────────────────────────────────────────────────

// The agent token is a bearer credential sent on every handshake and every
// game-library request, so it must never travel in cleartext. Plain http/ws is
// only tolerated for a loopback portal (local development).
function _isSecureOrLoopback(urlText) {
    let parsedUrl;
    try { parsedUrl = new URL(urlText); } catch { return false; }
    if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'wss:') return true;
    const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '');
    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    return isLoopback && (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'ws:');
}

function _connect() {
    if (_stopping) return;

    // Resolve the WSS URL: normalise http(s):// → ws(s)://
    // The gateway only accepts /{orgSlug}/machines/{machSlug} — any other path is
    // rejected with 4004 Invalid connection path.
    const base  = _portalUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
    const wsUrl = `${base}/${encodeURIComponent(_orgSlug)}/machines/${encodeURIComponent(_machSlug)}`;

    if (!_isSecureOrLoopback(wsUrl)) {
        console.error('[Citadel] Refusing to connect: portal URL must use https:// (plain http/ws is only allowed for localhost).');
        _setStatus('disconnected');
        return;
    }

    _setStatus('connecting');
    console.log(`[Citadel] Connecting to ${wsUrl}…`);

    let WebSocket;
    try {
        WebSocket = require('ws');
    } catch {
        console.error('[Citadel] ws package not installed — run npm install in the RSM directory');
        _setStatus('disconnected');
        return;
    }

    // start() can be called again while a socket is live (settings re-saved).
    // Retire the old one first; otherwise both sockets exist, the gateway
    // displaces one, and its close event would tear down the survivor.
    if (_ws) {
        const previousSocket = _ws;
        _ws = null;
        _clearTimers();
        previousSocket.removeAllListeners();
        previousSocket.on('error', () => {});
        try { previousSocket.close(1000, 'Reconfigured'); } catch {}
    }

    const ws = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${_agentToken}` },
        handshakeTimeout: 10_000,
    });

    _ws = ws;

    ws.on('open', () => {
        console.log('[Citadel] Connected to portal');
        _retryDelay = 1000;
        _setStatus('connected');

        // Announce ourselves with the current server list
        _send({
            type:    'announce',
            version: _getAppVersion(),
            servers: _getManagedServers().map(_formatServer),
        });

        // The gateway pings us too, but a half-open link only shows up when WE
        // stop hearing back: terminate after one unanswered ping so the close
        // handler can reconnect instead of sitting "connected" forever.
        let awaitingPong = false;
        ws.on('pong', () => { awaitingPong = false; });
        _pingTimer = setInterval(() => {
            if (ws.readyState !== ws.OPEN) return;
            if (awaitingPong) { ws.terminate(); return; }
            awaitingPong = true;
            ws.ping();
        }, 30_000);
    });

    ws.on('message', (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }
        // Valid JSON is not necessarily an object (null, 5, "x", [...]);
        // destructuring those in _handleMessage would throw in this listener.
        if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) return;
        _handleMessage(msg);
    });

    ws.on('close', (code) => {
        // Ignore the close of a socket we already replaced or stopped.
        if (ws !== _ws) return;
        _clearTimers();
        _ws = null;
        if (!_stopping) {
            console.log(`[Citadel] Disconnected (${code}). Reconnecting in ${_retryDelay / 1000}s…`);
            _setStatus('disconnected');
            _scheduleReconnect();
        }
    });

    ws.on('error', (err) => {
        console.error('[Citadel] WebSocket error:', err.message);
        // 'close' will fire after this and handle reconnect
    });
}

function _scheduleReconnect() {
    if (_stopping) return;
    _retryTimer = setTimeout(() => {
        _retryDelay = Math.min(_retryDelay * 2, MAX_RETRY);
        _connect();
    }, _retryDelay);
}

function _clearTimers() {
    if (_pingTimer)  { clearInterval(_pingTimer);  _pingTimer  = null; }
    if (_retryTimer) { clearTimeout(_retryTimer);  _retryTimer = null; }
}

// ── Command handling ───────────────────────────────────────────────────────

function _handleMessage(msg) {
    const { type, msgId, serverId } = msg;
    console.log(`[Citadel] Received command: ${type}${serverId ? ' server=' + serverId : ''}`);

    const respond = (data, error) => {
        _send({ type: 'response', msgId, success: !error, data, error: error || undefined });
    };

    const event = _makeReplyEvent();

    switch (type) {
        // Sent by the gateway right after a successful handshake; nothing to do.
        case 'welcome':
            break;

        case 'status': {
            respond({ servers: _getManagedServers().map(_formatServer) });
            break;
        }

        case 'start': {
            const srv = _getManagedServers().find(managedServer => managedServer.id === serverId);
            if (!srv) { respond(null, 'Server not found'); break; }
            if (srv.status === 'Online' || srv.status === 'Starting') {
                respond(null, `Server is already ${srv.status}`); break;
            }
            _ipcMain.emit('start-server', event, { ...srv });
            respond({ message: `Start signal sent to ${srv.name}` });
            break;
        }

        case 'stop': {
            const srv = _getManagedServers().find(managedServer => managedServer.id === serverId);
            if (!srv) { respond(null, 'Server not found'); break; }
            if (srv.status === 'Offline') { respond(null, 'Server is already Offline'); break; }
            _ipcMain.emit('stop-server', event, serverId);
            respond({ message: `Stop signal sent to ${srv.name}` });
            break;
        }

        case 'restart': {
            const srv = _getManagedServers().find(managedServer => managedServer.id === serverId);
            if (!srv) { respond(null, 'Server not found'); break; }
            _ipcMain.emit('restart-server', event, serverId);
            respond({ message: `Restart signal sent to ${srv.name}` });
            break;
        }

        case 'command': {
            const srv = _getManagedServers().find(managedServer => managedServer.id === serverId);
            if (!srv) { respond(null, 'Server not found'); break; }
            const command = (msg.command || '').trim();
            if (!command) { respond(null, 'command field is required'); break; }
            _ipcMain.emit('send-command', event, { srvId: serverId, command });
            respond({ message: `Command sent: ${command}` });
            break;
        }

        case 'logs': {
            const srv = _getManagedServers().find(managedServer => managedServer.id === serverId);
            if (!srv) { respond(null, 'Server not found'); break; }
            const raw   = srv.logs || '';
            const lines = raw.split('\n');
            respond({ log: lines.slice(-200).join('\n'), totalLines: lines.length });
            break;
        }

        case 'firewall': {
            // Async — respond is called from inside the handler.
            _handleFirewall(msg.firewall || {}, respond);
            break;
        }

        case 'system': {
            _handleSystem(msg.system || {}, respond);
            break;
        }

        default:
            console.warn(`[Citadel] Unknown command type: ${type}`);
    }
}

// Relay firewall operations to the shared Windows Firewall helpers.
async function _handleFirewall({ op, rule = {} }, respond) {
    if (!_getFirewallRules) { respond(null, 'Firewall control is not available on this machine'); return; }
    try {
        switch (op) {
            case 'list': {
                const rules = await _getFirewallRules();
                respond({ rules });
                break;
            }
            case 'add': {
                const result = await _addFirewallRule({
                    displayName: rule.displayName,
                    port:        rule.port,
                    tcp:         !!rule.tcp,
                    udp:         !!rule.udp,
                });
                if (result && result.success) respond({ message: 'Rule added', rule: rule.displayName });
                else respond(null, (result && result.error) || 'Failed to add rule');
                break;
            }
            case 'remove': {
                const name   = rule.displayName || rule.name;
                const result = await _removeFirewallRule(name);
                if (result && result.success) respond({ message: 'Rule removed', rule: name });
                else respond(null, (result && result.error) || 'Failed to remove rule');
                break;
            }
            case 'toggle': {
                const name   = rule.displayName || rule.name;
                const result = await _toggleFirewallRule(name, !!rule.enabled);
                if (result && result.success) respond({ message: 'Rule updated', rule: name, enabled: !!rule.enabled });
                else respond(null, (result && result.error) || 'Failed to update rule');
                break;
            }
            default:
                respond(null, `Unknown firewall op: ${op}`);
        }
    } catch (err) {
        respond(null, err.message || 'Firewall operation failed');
    }
}

// Relay system-level operations (RSM process status / restart).
function _handleSystem({ op }, respond) {
    switch (op) {
        case 'status': {
            const servers = _getManagedServers();
            respond({
                version:  _getAppVersion(),
                platform: process.platform,
                servers:  servers.length,
                online:   servers.filter(server => server.status === 'Online').length,
            });
            break;
        }
        case 'restart': {
            if (!_app) { respond(null, 'Restart is not available'); return; }
            // Acknowledge before relaunching — the WSS connection drops on exit.
            respond({ message: 'RSM is restarting…' });
            setTimeout(() => { try { _app.relaunch(); _app.exit(0); } catch (error) { console.error('[Citadel] Restart failed:', error.message); } }, 500);
            break;
        }
        default:
            respond(null, `Unknown system op: ${op}`);
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _send(msg) {
    if (!_ws || _ws.readyState !== _ws.OPEN) return;
    try { _ws.send(JSON.stringify(msg)); } catch (error) {
        console.error('[Citadel] Send error:', error.message);
    }
}

function _setStatus(status) {
    _status = status;
    const win = _getMainWindow ? _getMainWindow() : null;
    if (win && !win.isDestroyed()) {
        win.webContents.send('citadel-status', status);
    }
}

function _formatServer(srv) {
    const stats = _getServerStats()[srv.id]     || {};
    const proc  = _getActiveProcesses()[srv.id] || {};
    return {
        id:            srv.id,
        name:          srv.name,
        type:          srv.type,
        status:        srv.status,
        pid:           srv.pid     || null,
        cpu:           stats.cpu   ?? null,
        ramMB:         stats.ramMB ?? null,
        uptimeSeconds: proc.startedAt ? Math.floor((Date.now() - proc.startedAt) / 1000) : null,
    };
}

function _makeReplyEvent() {
    return {
        reply: (channel, data) => {
            const win = _getMainWindow();
            if (win && !win.isDestroyed()) win.webContents.send(channel, data);
        }
    };
}

// ── Citadel game-library client ──────────────────────────────────────────────
// Reads the published game-server file repository over HTTPS. citadelApiUrl (or
// portalUrl as fallback) + the agent token authorise these calls. Designed so a
// Game/Version/Variant picker UI can call fetchGameLibrary() / fetchGameVersions()
// and downloadGameVersion() — the latter verifies SHA-256 before returning.

let _apiBase = '';

const API_REQUEST_TIMEOUT_MILLISECONDS = 15_000;
const DOWNLOAD_IDLE_TIMEOUT_MILLISECONDS = 60_000;

function setApiBase(url) {
    _apiBase = (url || '').trim().replace(/\/+$/, '');
}

function _apiUrl(apiPath) {
    const base = _apiBase || _portalUrl.replace(/\/+$/, '');
    const fullUrl = base + apiPath;
    // The agent token travels as a Bearer credential on every one of these calls.
    if (!_isSecureOrLoopback(fullUrl)) {
        throw new Error('Refusing to send the agent token over an insecure connection: the Citadel URL must use https:// (plain http is only allowed for localhost).');
    }
    return fullUrl;
}

async function _apiGet(apiPath) {
    if (typeof fetch !== 'function') throw new Error('fetch is unavailable in this runtime.');
    const response = await fetch(_apiUrl(apiPath), {
        headers: { Authorization: `Bearer ${_agentToken}` },
        // Without a timeout an unreachable portal would leave the UI waiting forever.
        signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MILLISECONDS),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Citadel API error (${response.status})`);
    }
    return response.json();
}

// GET /api/games — published builds grouped by game type.
async function fetchGameLibrary() {
    const data = await _apiGet('/api/games');
    return data.games || [];
}

// GET /api/games/:game/versions — published versions for one game.
async function fetchGameVersions(game) {
    const data = await _apiGet(`/api/games/${encodeURIComponent(game)}/versions`);
    return data.versions || [];
}

// POST /api/games/:game/versions/:id/download → presigned URL + sha256, then
// download to destPath and verify integrity. Deletes the file + throws on mismatch.
async function downloadGameVersion(game, versionId, destPath, onProgress = () => {}) {
    if (typeof fetch !== 'function') throw new Error('fetch is unavailable in this runtime.');
    const response = await fetch(
        _apiUrl(`/api/games/${encodeURIComponent(game)}/versions/${encodeURIComponent(versionId)}/download`),
        { method: 'POST', headers: { Authorization: `Bearer ${_agentToken}` }, signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MILLISECONDS) }
    );
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Citadel download request failed (${response.status})`);
    }
    const { url, sha256 } = await response.json();
    if (!url || !sha256) throw new Error('Citadel download response missing url or sha256.');
    if (!_isSecureOrLoopback(url)) throw new Error('Refusing to download from a non-https URL.');

    await _downloadToFile(url, destPath, onProgress);

    const actual = await _sha256File(destPath);
    if (actual.toLowerCase() !== String(sha256).toLowerCase()) {
        try { fs.unlinkSync(destPath); } catch {}
        throw new Error(`SHA-256 mismatch — expected ${sha256}, got ${actual}. Download deleted.`);
    }
    return { destPath, sha256: actual };
}

// The presigned URL is fetched WITHOUT the agent token (it authorises itself).
function _downloadToFile(fileUrl, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        const protocolModule = fileUrl.startsWith('https') ? require('https') : require('http');
        const outputFile = fs.createWriteStream(destPath);
        const removePartialFile = (error) => {
            outputFile.destroy();
            try { fs.unlinkSync(destPath); } catch {}
            reject(error);
        };

        const request = protocolModule.get(fileUrl, (response) => {
            if ((response.statusCode || 0) >= 300) {
                removePartialFile(new Error(`Download failed: HTTP ${response.statusCode}`));
                return;
            }
            const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
            let receivedBytes = 0;
            response.on('data', (chunk) => {
                receivedBytes += chunk.length;
                if (totalBytes) { try { onProgress(receivedBytes / totalBytes); } catch {} }
            });
            response.on('error', removePartialFile);
            response.on('aborted', () => removePartialFile(new Error('Download was interrupted.')));
            response.pipe(outputFile);
            outputFile.on('finish', () => outputFile.close(() => resolve()));
            outputFile.on('error', removePartialFile);
        });
        // Abort a stalled transfer instead of hanging the install wizard forever.
        request.setTimeout(DOWNLOAD_IDLE_TIMEOUT_MILLISECONDS, () => request.destroy(new Error('Download timed out (no data received).')));
        request.on('error', removePartialFile);
    });
}

function _sha256File(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

module.exports = {
    init, start, stop, isConnected, getStatus, notifyStatusChange, notifyPerfUpdate,
    notifyConsoleOutput,
    setApiBase, fetchGameLibrary, fetchGameVersions, downloadGameVersion,
};
