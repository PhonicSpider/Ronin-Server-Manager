'use strict';

// RSM REST API — exposes server management over HTTP so external tools
// (e.g. ArkenBot's rsm-manager addon) can control servers remotely.
// Authentication: x-api-key request header.
// All requests / responses are application/json.

const http   = require('http');
const crypto = require('crypto');

// ── Injected dependencies ──────────────────────────────────────────────────
let _getManagedServers;
let _getActiveProcesses;
let _getServerStats;
let _getMainWindow;
let _findServType;
let _ipcMain;

// ── Runtime state ─────────────────────────────────────────────────────────
let _server = null;
let _apiKey  = '';
let _port    = 3002;

// ── Public interface ───────────────────────────────────────────────────────

function init(deps) {
    _getManagedServers  = deps.getManagedServers;
    _getActiveProcesses = deps.getActiveProcesses;
    _getServerStats     = deps.getServerStats;
    _getMainWindow      = deps.getMainWindow;
    _findServType       = deps.findServType;
    _ipcMain            = deps.ipcMain;
}

function start(port, apiKey) {
    const newPort = port   || 3002;
    const newKey  = apiKey || '';

    // No-op if already listening on the same port with the same key
    if (_server && _port === newPort && _apiKey === newKey) return;

    _port   = newPort;
    _apiKey = newKey;

    if (_server) {
        _server.close();
        _server = null;
    }

    _server = http.createServer(onRequest);

    _server.listen(_port, '0.0.0.0', () => {
        console.log(`[RSM-API] Listening on 0.0.0.0:${_port}`);
    });

    _server.on('error', err => {
        console.error(`[RSM-API] Server error: ${err.message}`);
    });
}

function stop() {
    if (_server) {
        _server.close();
        _server = null;
        console.log('[RSM-API] Stopped');
    }
}

function generateApiKey() {
    return crypto.randomBytes(32).toString('hex');
}

// ── Core request dispatcher ────────────────────────────────────────────────

function onRequest(req, res) {
    // Collect body first for POST requests, then dispatch
    if (req.method === 'POST') {
        let raw = '';
        req.on('data', chunk => { raw += chunk.toString(); });
        req.on('end', () => {
            let body = {};
            try { body = JSON.parse(raw); } catch {}
            dispatch(req, res, body);
        });
        req.on('error', () => send(res, 400, { error: 'Bad request' }));
    } else {
        // Drain any unexpected body so the socket stays healthy
        req.resume();
        req.on('end', () => dispatch(req, res, {}));
    }
}

function dispatch(req, res, body) {
    // ── CORS pre-flight ──────────────────────────────────────────────────
    if (req.method === 'OPTIONS') {
        send(res, 204, null);
        return;
    }

    // ── Auth ─────────────────────────────────────────────────────────────
    if (!_apiKey || req.headers['x-api-key'] !== _apiKey) {
        send(res, 401, { error: 'Unauthorized' });
        return;
    }

    const url = (req.url || '/').split('?')[0].replace(/\/+$/, '') || '/';

    // ── GET /api/servers ─────────────────────────────────────────────────
    if (req.method === 'GET' && url === '/api/servers') {
        send(res, 200, { servers: _getManagedServers().map(formatServer) });
        return;
    }

    // ── Routes with a server ID ──────────────────────────────────────────
    const routeMatch = url.match(/^\/api\/servers\/([^/]+)(?:\/([^/]+))?$/);
    if (!routeMatch) {
        send(res, 404, { error: 'Not found' });
        return;
    }

    const srvId  = routeMatch[1];
    const action = routeMatch[2];
    const srv    = _getManagedServers().find(s => s.id === srvId);

    if (!srv) {
        send(res, 404, { error: 'Server not found' });
        return;
    }

    // GET /api/servers/:id
    if (req.method === 'GET' && !action) {
        send(res, 200, formatServer(srv));
        return;
    }

    // POST /api/servers/:id/start
    if (req.method === 'POST' && action === 'start') {
        if (srv.status === 'Online' || srv.status === 'Starting') {
            send(res, 409, { error: `Server is already ${srv.status}` });
            return;
        }
        _ipcMain.emit('start-server', makeReplyEvent(), { ...srv });
        send(res, 200, { message: `Start signal sent to ${srv.name}` });
        return;
    }

    // POST /api/servers/:id/stop
    if (req.method === 'POST' && action === 'stop') {
        if (srv.status === 'Offline') {
            send(res, 409, { error: 'Server is already Offline' });
            return;
        }
        _ipcMain.emit('stop-server', makeReplyEvent(), srv.id);
        send(res, 200, { message: `Stop signal sent to ${srv.name}` });
        return;
    }

    // POST /api/servers/:id/command
    if (req.method === 'POST' && action === 'command') {
        const command = (body.command || '').trim();
        if (!command) {
            send(res, 400, { error: 'command field is required' });
            return;
        }
        const processInfo = _getActiveProcesses()[srv.id];
        if (!processInfo) {
            send(res, 409, { error: 'Server is not running' });
            return;
        }
        executeCommand(srv, processInfo, command)
            .then(output => {
                const win = _getMainWindow();
                if (win && !win.isDestroyed()) {
                    win.webContents.send('console-out', {
                        id: srv.id,
                        msg: `[API] > ${command}\n${output ? output + '\n' : ''}`
                    });
                }
                send(res, 200, { success: true, output });
            })
            .catch(err => send(res, 500, { success: false, output: err.message }));
        return;
    }

    send(res, 405, { error: 'Method not allowed' });
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Always sends a complete, self-contained HTTP response.
// Explicit Content-Length + Connection:close so the client never has to wait
// for chunked transfer or connection teardown to know the response is done.
function send(res, statusCode, body) {
    const payload = body === null ? '' : JSON.stringify(body);
    const buf     = Buffer.from(payload, 'utf8');

    res.writeHead(statusCode, {
        'Content-Type':                 'application/json',
        'Content-Length':               buf.length,
        'Connection':                   'close',
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key'
    });
    res.end(buf);
}

function formatServer(srv) {
    const stats = _getServerStats()[srv.id] || {};
    return {
        id:     srv.id,
        name:   srv.name,
        type:   srv.type,
        status: srv.status,
        pid:    srv.pid    || null,
        cpu:    stats.cpu   ?? null,
        ramMB:  stats.ramMB ?? null
    };
}

// Creates a fake IPC event whose reply() forwards messages to the renderer.
// This lets us reuse existing ipcMain handlers (start-server, stop-server)
// without duplicating their logic.
function makeReplyEvent() {
    return {
        reply: (channel, data) => {
            const win = _getMainWindow();
            if (win && !win.isDestroyed()) win.webContents.send(channel, data);
        }
    };
}

async function executeCommand(srv, processInfo, command) {
    const serverCategory = _findServType(srv);

    // DIRECT_CONSOLE servers (Minecraft, Terraria, 7DaysToDie) — write to stdin
    if (serverCategory === 'DIRECT_CONSOLE') {
        const child = processInfo.shell;
        if (child?.stdin?.writable) {
            child.stdin.write(command + '\n');
            return 'Command sent';
        }
        throw new Error('Console stdin is not available');
    }

    // Space Engineers — VRage Remote HTTP API
    if (srv.type === 'space-engineers') {
        if (!srv.apiPort || !srv.apiPass) {
            throw new Error('API Port and Password are required for Space Engineers commands');
        }
        const axios = require('axios');
        const url   = `http://localhost:${srv.apiPort}/vrageremote/v1/server/command`;
        await axios.post(url, { Command: command }, {
            headers: {
                'Remote-Control-Http-Password': srv.apiPass,
                'Content-Type': 'application/json'
            },
            timeout: 3000
        });
        return 'Command sent to Space Engineers';
    }

    // RCON (Ark, Starfield, etc.)
    if (!srv.apiPort || !srv.apiPass) {
        throw new Error('RCON Port and Password are required to send commands');
    }
    const { Rcon } = require('rcon-client');
    const rcon = await Rcon.connect({
        host:     'localhost',
        port:     parseInt(srv.apiPort),
        password: srv.apiPass,
        timeout:  3000
    });
    const response = await rcon.send(command);
    rcon.end();
    return response || 'Command sent';
}

module.exports = { init, start, stop, generateApiKey };
