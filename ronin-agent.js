'use strict';

// Ronin Citadel Agent — maintains an outbound WSS tunnel to the portal gateway.
// Wired into RSM the same way api-server.js is: call init() with injected deps,
// then start() / stop() to connect / disconnect.

const crypto = require('crypto');

// ── Injected dependencies ──────────────────────────────────────────────────
let _getManagedServers;
let _getActiveProcesses;
let _getServerStats;
let _getMainWindow;
let _findServType;
let _ipcMain;
let _logConsoleOut;
let _getAppVersion;
let _app;

// ── Runtime state ──────────────────────────────────────────────────────────
let _ws          = null;
let _enabled     = false;
let _portalUrl   = '';
let _agentToken  = '';
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
    _findServType       = deps.findServType;
    _ipcMain            = deps.ipcMain;
    _logConsoleOut      = deps.logConsoleOut;
    _getAppVersion      = deps.getAppVersion || (() => '?');
    _app                = deps.app;
}

function start(portalUrl, agentToken) {
    _stopping    = false;
    _portalUrl   = (portalUrl  || '').trim();
    _agentToken  = (agentToken || '').trim();

    if (!_portalUrl || !_agentToken) {
        console.warn('[Citadel] Cannot start: portalUrl or agentToken not set');
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

// Called by main.js whenever a server's status changes (Online / Offline).
// Pushes the update to the portal immediately if connected.
function notifyStatusChange(serverId, status, pid) {
    _send({ type: 'status_update', serverId, status, pid: pid || null });
}

// Called by main.js on every perf tick so the portal gets live CPU/RAM.
function notifyPerfUpdate(serverId, cpu, ramMB) {
    _send({ type: 'perf_update', serverId, cpu, ramMB });
}

// ── Connection logic ───────────────────────────────────────────────────────

function _connect() {
    if (_stopping) return;

    // Resolve the WSS URL: normalise http(s):// → ws(s)://
    let url = _portalUrl.replace(/^http/, 'ws');
    if (!url.endsWith('/')) url += '';
    const wsUrl = url.replace(/\/+$/, '') + '/api/agent/connect';

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

        _pingTimer = setInterval(() => {
            if (ws.readyState === ws.OPEN) ws.ping();
        }, 30_000);
    });

    ws.on('message', (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }
        _handleMessage(msg);
    });

    ws.on('pong', () => {
        // Portal acknowledged ping — connection is alive
    });

    ws.on('close', (code, reason) => {
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
        case 'status': {
            respond({ servers: _getManagedServers().map(_formatServer) });
            break;
        }

        case 'start': {
            const srv = _getManagedServers().find(s => s.id === serverId);
            if (!srv) { respond(null, 'Server not found'); break; }
            if (srv.status === 'Online' || srv.status === 'Starting') {
                respond(null, `Server is already ${srv.status}`); break;
            }
            _ipcMain.emit('start-server', event, { ...srv });
            respond({ message: `Start signal sent to ${srv.name}` });
            break;
        }

        case 'stop': {
            const srv = _getManagedServers().find(s => s.id === serverId);
            if (!srv) { respond(null, 'Server not found'); break; }
            if (srv.status === 'Offline') { respond(null, 'Server is already Offline'); break; }
            _ipcMain.emit('stop-server', event, serverId);
            respond({ message: `Stop signal sent to ${srv.name}` });
            break;
        }

        case 'restart': {
            const srv = _getManagedServers().find(s => s.id === serverId);
            if (!srv) { respond(null, 'Server not found'); break; }
            _ipcMain.emit('restart-server', event, serverId);
            respond({ message: `Restart signal sent to ${srv.name}` });
            break;
        }

        case 'command': {
            const srv = _getManagedServers().find(s => s.id === serverId);
            if (!srv) { respond(null, 'Server not found'); break; }
            const command = (msg.command || '').trim();
            if (!command) { respond(null, 'command field is required'); break; }
            _ipcMain.emit('send-command', event, { srvId: serverId, command });
            respond({ message: `Command sent: ${command}` });
            break;
        }

        case 'logs': {
            const srv = _getManagedServers().find(s => s.id === serverId);
            if (!srv) { respond(null, 'Server not found'); break; }
            const raw   = srv.logs || '';
            const lines = raw.split('\n');
            respond({ log: lines.slice(-200).join('\n'), totalLines: lines.length });
            break;
        }

        default:
            console.warn(`[Citadel] Unknown command type: ${type}`);
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _send(msg) {
    if (!_ws || _ws.readyState !== _ws.OPEN) return;
    try { _ws.send(JSON.stringify(msg)); } catch (e) {
        console.error('[Citadel] Send error:', e.message);
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

module.exports = { init, start, stop, isConnected, notifyStatusChange, notifyPerfUpdate };
