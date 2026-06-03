'use strict';

// RSM REST API — exposes server management over HTTPS so external tools
// (e.g. ArkenBot's rsm-manager addon) can control servers remotely.
// Authentication: x-api-key request header (constant-time comparison).
// All requests / responses are application/json.

const { Rcon } = require('rcon-client');
const axios = require('axios');
const http   = require('http');
const https  = require('https');
const crypto = require('crypto');

const MAX_BODY = 1 * 1024 * 1024; // 1 MB request body cap

// ── Rate limiting ──────────────────────────────────────────────────────────
// Tracks failed auth attempts per IP to prevent brute-force key guessing.
// 5 failures within a rolling window triggers a 60-second block.
const _failedAuth       = new Map(); // ip → { count, lastFailure, blockedUntil }
const RATE_LIMIT_MAX    = 5;
const RATE_LIMIT_MS     = 60_000;   // block duration
const RATE_LIMIT_DECAY  = 300_000;  // clear stale entries after 5 minutes

function _isRateLimited(ip) {
    const now   = Date.now();
    const entry = _failedAuth.get(ip);
    if (!entry) return false;
    if (now - entry.lastFailure > RATE_LIMIT_DECAY) { _failedAuth.delete(ip); return false; }
    return entry.blockedUntil && now < entry.blockedUntil;
}

function _recordFailure(ip) {
    const now   = Date.now();
    const entry = _failedAuth.get(ip) || { count: 0, lastFailure: 0 };
    entry.count++;
    entry.lastFailure = now;
    if (entry.count >= RATE_LIMIT_MAX) {
        entry.blockedUntil = now + RATE_LIMIT_MS;
        console.warn(`[RSM-API] Rate limit triggered for ${ip} — blocked for ${RATE_LIMIT_MS / 1000}s`);
    }
    _failedAuth.set(ip, entry);
}

function _clearFailure(ip) { _failedAuth.delete(ip); }

// ── Injected dependencies ──────────────────────────────────────────────────
let _getManagedServers;
let _getActiveProcesses;
let _getServerStats;
let _getMainWindow;
let _findServType;
let _ipcMain;
let _logConsoleOut;

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
    _logConsoleOut      = deps.logConsoleOut;
}

// tlsOpts: { key, cert } for HTTPS, omit for plain HTTP (dev/fallback only).
function start(port, apiKey, tlsOpts) {
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

    _server = tlsOpts
        ? https.createServer(tlsOpts, onRequest)
        : http.createServer(onRequest);

    _server.listen(_port, '0.0.0.0', () => {
        console.log(`[RSM-API] Listening on 0.0.0.0:${_port} (${tlsOpts ? 'HTTPS' : 'HTTP'})`);
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
        req.on('data', chunk => {
            if (raw.length + chunk.length > MAX_BODY) {
                req.destroy();
                return;
            }
            raw += chunk.toString();
        });
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
    const clientIp = req.socket?.remoteAddress || 'unknown';
    const url      = (req.url || '/').split('?')[0].replace(/\/+$/, '') || '/';

    // ── CORS pre-flight ──────────────────────────────────────────────────
    if (req.method === 'OPTIONS') {
        send(res, 204, null);
        return;
    }

    // ── Health check (unauthenticated — lets monitors confirm the API is up) ─
    if (req.method === 'GET' && url === '/api/health') {
        send(res, 200, { status: 'ok', version: '1.0' });
        return;
    }

    // ── Rate limit check ─────────────────────────────────────────────────
    if (_isRateLimited(clientIp)) {
        console.warn(`[RSM-API] ${req.method} ${url} — 429 blocked (${clientIp})`);
        send(res, 429, { error: 'Too many failed attempts. Try again later.' });
        return;
    }

    // ── Auth (constant-time comparison) ──────────────────────────────────
    if (!_apiKey) {
        send(res, 401, { error: 'Unauthorized' });
        return;
    }
    const incoming = Buffer.from(req.headers['x-api-key'] || '', 'utf8');
    const expected = Buffer.from(_apiKey, 'utf8');
    if (incoming.length !== expected.length || !crypto.timingSafeEqual(incoming, expected)) {
        _recordFailure(clientIp);
        send(res, 401, { error: 'Unauthorized' });
        return;
    }
    _clearFailure(clientIp); // successful auth resets the counter

    // ── Access log ───────────────────────────────────────────────────────
    console.log(`[RSM-API] ${req.method} ${url} — from ${clientIp}`);

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

    // POST /api/servers/:id/restart
    // Delegates to the restart-server IPC handler in main.js which handles
    // stop → wait for exit → start. Returns immediately; watch status-change for result.
    if (req.method === 'POST' && action === 'restart') {
        _ipcMain.emit('restart-server', makeReplyEvent(), srv.id);
        send(res, 200, { message: `Restart signal sent to ${srv.name}` });
        return;
    }

    // POST /api/servers/:id/kill
    // Hard kill via taskkill — use when stop is unresponsive.
    if (req.method === 'POST' && action === 'kill') {
        const processInfo = _getActiveProcesses()[srv.id];
        if (!processInfo?.pid) {
            send(res, 409, { error: 'Server is not running' });
            return;
        }
        _ipcMain.emit('kill-server', makeReplyEvent(), processInfo.pid);
        send(res, 200, { message: `Kill signal sent to ${srv.name} (PID: ${processInfo.pid})` });
        return;
    }

    // GET /api/servers/:id/logs
    // Returns the last 200 lines of buffered console output for the server.
    if (req.method === 'GET' && action === 'logs') {
        const raw   = srv.logs || '';
        const lines = raw.split('\n');
        const tail  = lines.slice(-200).join('\n');
        send(res, 200, { id: srv.id, totalLines: lines.length, log: tail });
        return;
    }

    // GET /api/servers/:id/players
    if (req.method === 'GET' && action === 'players') {
        if (srv.status !== 'Online') {
            send(res, 409, { error: 'Server is not running' });
            return;
        }
        const processInfo = _getActiveProcesses()[srv.id];
        if (!processInfo) {
            send(res, 409, { error: 'Server process not attached — restart the server through RSM to enable this endpoint' });
            return;
        }
        fetchPlayers(srv, processInfo)
            .then(data => send(res, 200, data))
            .catch(err => send(res, 500, { error: err.message }));
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
                if (_logConsoleOut) _logConsoleOut(srv.id, `[API] > ${command}\n${output ? output + '\n' : ''}`);
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
        'Content-Type':   'application/json',
        'Content-Length': buf.length,
        'Connection':     'close',
        // Wildcard is intentional — RSM binds to 0.0.0.0 for LAN tools (e.g. ArkenBot).
        // Tighten this if you expose the API beyond the local network.
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key'
    });
    res.end(buf);
}

function formatServer(srv) {
    const stats     = _getServerStats()[srv.id]     || {};
    const proc      = _getActiveProcesses()[srv.id] || {};
    const uptime    = proc.startedAt ? Math.floor((Date.now() - proc.startedAt) / 1000) : null;
    return {
        id:             srv.id,
        name:           srv.name,
        type:           srv.type,
        status:         srv.status,
        pid:            srv.pid     || null,
        cpu:            stats.cpu   ?? null,
        ramMB:          stats.ramMB ?? null,
        uptimeSeconds:  uptime
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
    // and capture whatever the server echoes back on stdout within 1.5 s.
    if (serverCategory === 'DIRECT_CONSOLE') {
        const child = processInfo.shell;
        if (!child?.stdin?.writable) throw new Error('Console stdin is not available');

        return new Promise((resolve) => {
            const chunks = [];
            const onData = (data) => chunks.push(data.toString());
            child.stdout.on('data', onData);
            child.stdin.write(command + '\n');

            setTimeout(() => {
                child.stdout.off('data', onData);
                const output = chunks.join('').trim();
                resolve(output || '(no output)');
            }, 1500);
        });
    }

    // Space Engineers — VRage Remote HTTP API
    if (srv.type === 'space-engineers') {
        if (!srv.apiPort || !srv.apiPass) {
            throw new Error('API Port and Password are required for Space Engineers commands');
        }
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
    const rcon = await Rcon.connect({
        host:     '127.0.0.1',
        port:     parseInt(srv.apiPort),
        password: srv.apiPass,
        timeout:  3000
    });
    try {
        const response = await rcon.send(command);
        return response || 'Command sent';
    } finally {
        rcon.end();
    }
}

async function fetchPlayers(srv, processInfo) {
    // Space Engineers — VRage HTTP session endpoint returns structured data;
    // executeCommand only returns 'Command sent' so we need the direct HTTP call here.
    if (srv.type === 'space-engineers') {
        if (!srv.apiPort) throw new Error('API Port is required for Space Engineers player count');
        const port = srv.apiPort || 8080;
        const pass = srv.apiPass || '';
        const hdrs = pass ? { Authorization: `Basic ${Buffer.from(`:${pass}`).toString('base64')}` } : {};
        const res  = await axios.get(`http://localhost:${port}/v1/session`, { headers: hdrs, timeout: 3000 });
        const session = res.data?.data || res.data || {};
        return { online: session.Players ?? null, max: session.MaxPlayers ?? null, players: [] };
    }

    // All other game types: send the command defined in the game config and parse the output.
    // New games never need to touch this function — just set backend.playerListCommand in their config.
    if (!srv.playerListCommand) {
        return { online: null, max: null, players: [], note: 'Player list not supported for this server type' };
    }

    const output = await executeCommand(srv, processInfo, srv.playerListCommand);

    // Minecraft-style: "There are 2 of a max of 20 players online: Alice, Bob"
    const mcMatch = output.match(/There are (\d+) of a max(?: of)? (\d+) players online:\s*(.*)/i);
    if (mcMatch) {
        const players = mcMatch[3].trim() ? mcMatch[3].split(',').map(p => p.trim()).filter(Boolean) : [];
        return { online: parseInt(mcMatch[1]), max: parseInt(mcMatch[2]), players };
    }

    // RCON numbered-list style: "1. PlayerName, steamid\n2. PlayerName2, steamid2" (Ark, Rust, PalWorld, etc.)
    const numberedLines = output.trim().split('\n').filter(l => /^\d+\./.test(l));
    if (numberedLines.length > 0) {
        const players = numberedLines.map(l => {
            const m = l.match(/^\d+\.\s+(.+?),/);
            return m ? m[1].trim() : l.replace(/^\d+\.\s*/, '').trim();
        });
        return { online: players.length, max: null, players };
    }

    // Generic fallback — return raw output for the caller to interpret
    return { online: null, max: null, players: [], rawOutput: output.trim() };
}

module.exports = { init, start, stop, generateApiKey };
