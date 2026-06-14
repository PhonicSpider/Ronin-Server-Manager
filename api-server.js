'use strict';

// RSM REST API — exposes server management over HTTPS so external tools
// (e.g. ArkenBot's rsm-manager addon, the Ronin Citadel portal) can control
// servers remotely.  Auth: x-api-key header, constant-time comparison.
// All requests/responses are application/json.

const { Rcon } = require('rcon-client');
const axios  = require('axios');
const http   = require('http');
const https  = require('https');
const crypto = require('crypto');
const os     = require('os');

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
// Server CRUD helpers
let _addServer;
let _updateServer;
let _deleteServer;
// Firewall helpers
let _getFirewallRules;
let _addFirewallRule;
let _removeFirewallRule;
let _toggleFirewallRule;
// Config / backup helpers
let _readConfigFile;
let _writeConfigFile;
let _listBackups;
// Forge proxy config
let _getForgeConfig;
// App info / control
let _getAppVersion;
let _restartApp;

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
    // New deps — fall back gracefully so old callers without them still boot
    _addServer          = deps.addServer          || null;
    _updateServer       = deps.updateServer        || null;
    _deleteServer       = deps.deleteServer        || null;
    _getFirewallRules   = deps.getFirewallRules    || null;
    _addFirewallRule    = deps.addFirewallRule      || null;
    _removeFirewallRule = deps.removeFirewallRule   || null;
    _toggleFirewallRule = deps.toggleFirewallRule   || null;
    _readConfigFile     = deps.readConfigFile       || null;
    _writeConfigFile    = deps.writeConfigFile      || null;
    _listBackups        = deps.listBackups          || null;
    _getForgeConfig     = deps.getForgeConfig       || null;
    _getAppVersion      = deps.getAppVersion        || (() => '?');
    _restartApp         = deps.restartApp           || null;
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
    // Collect body for any method that may carry one
    const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (hasBody) {
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
        req.resume();
        req.on('end', () => dispatch(req, res, {}));
    }
}

function dispatch(req, res, body) {
    const clientIp = req.socket?.remoteAddress || 'unknown';
    const rawUrl   = req.url || '/';
    const qIdx     = rawUrl.indexOf('?');
    const url      = (qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx)).replace(/\/+$/, '') || '/';
    const qs       = new URLSearchParams(qIdx === -1 ? '' : rawUrl.slice(qIdx + 1));
    const m        = req.method;

    // ── CORS pre-flight ──────────────────────────────────────────────────
    if (m === 'OPTIONS') {
        send(res, 204, null);
        return;
    }

    // ── Health check (unauthenticated — lets monitors confirm the API is up) ─
    if (m === 'GET' && url === '/api/health') {
        send(res, 200, { status: 'ok', version: _getAppVersion() });
        return;
    }

    // ── Rate limit check ─────────────────────────────────────────────────
    if (_isRateLimited(clientIp)) {
        console.warn(`[RSM-API] ${m} ${url} — 429 blocked (${clientIp})`);
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
    _clearFailure(clientIp);

    // ── Access log ───────────────────────────────────────────────────────
    console.log(`[RSM-API] ${m} ${url} — from ${clientIp}`);

    // ── System ───────────────────────────────────────────────────────────

    if (m === 'GET' && url === '/api/system/status') {
        const servers = _getManagedServers();
        send(res, 200, {
            platform:    os.platform(),
            arch:        os.arch(),
            hostname:    os.hostname(),
            uptimeS:     os.uptime(),
            freeMemMB:   Math.round(os.freemem()  / 1024 / 1024),
            totalMemMB:  Math.round(os.totalmem() / 1024 / 1024),
            cpuCount:    os.cpus().length,
            rsmVersion:  _getAppVersion(),
            serverCount: servers.length,
            onlineCount: servers.filter(s => s.status === 'Online').length,
        });
        return;
    }

    if (m === 'POST' && url === '/api/system/restart') {
        if (!_restartApp) { send(res, 501, { error: 'Not implemented' }); return; }
        send(res, 200, { message: 'RSM is restarting...' });
        setTimeout(() => _restartApp(), 500);
        return;
    }

    // ── Firewall ──────────────────────────────────────────────────────────

    if (url === '/api/firewall/rules') {
        if (m === 'GET') {
            if (!_getFirewallRules) { send(res, 501, { error: 'Not implemented' }); return; }
            _getFirewallRules()
                .then(rules => send(res, 200, { rules }))
                .catch(err  => send(res, 500, { error: err.message }));
            return;
        }
        if (m === 'POST') {
            if (!_addFirewallRule) { send(res, 501, { error: 'Not implemented' }); return; }
            const { displayName, port, tcp, udp } = body;
            if (!displayName || !port) {
                send(res, 400, { error: 'displayName and port are required' }); return;
            }
            if (!tcp && !udp) {
                send(res, 400, { error: 'At least one of tcp or udp must be true' }); return;
            }
            _addFirewallRule({ displayName, port, tcp: !!tcp, udp: !!udp })
                .then(r  => send(res, r.success ? 201 : 500, r))
                .catch(e => send(res, 500, { error: e.message }));
            return;
        }
        send(res, 405, { error: 'Method not allowed' }); return;
    }

    // DELETE /api/firewall/rules/:name  •  PATCH /api/firewall/rules/:name
    const fwMatch = url.match(/^\/api\/firewall\/rules\/(.+)$/);
    if (fwMatch) {
        const ruleName = decodeURIComponent(fwMatch[1]);
        if (m === 'DELETE') {
            if (!_removeFirewallRule) { send(res, 501, { error: 'Not implemented' }); return; }
            _removeFirewallRule(ruleName)
                .then(r  => send(res, r.success ? 200 : 500, r))
                .catch(e => send(res, 500, { error: e.message }));
            return;
        }
        if (m === 'PATCH') {
            if (!_toggleFirewallRule) { send(res, 501, { error: 'Not implemented' }); return; }
            if (typeof body.enabled !== 'boolean') {
                send(res, 400, { error: 'enabled (boolean) is required' }); return;
            }
            _toggleFirewallRule(ruleName, body.enabled)
                .then(r  => send(res, r.success ? 200 : 500, r))
                .catch(e => send(res, 500, { error: e.message }));
            return;
        }
        send(res, 405, { error: 'Method not allowed' }); return;
    }

    // ── Install / Forge proxy ─────────────────────────────────────────────
    // RSM proxies install requests to Forge's local API so the portal only
    // needs to talk to a single endpoint.  Configure the Forge connection
    // URL + key via forge-connection.json in RSM's userData directory.

    if (url.startsWith('/api/install')) {
        if (m === 'GET' && url === '/api/install/games') {
            _forgeProxy('get', '/api/games')
                .then(r => send(res, r.status, r.body))
                .catch(e => send(res, 502, { error: e.message }));
            return;
        }
        if (m === 'GET' && url === '/api/install/jobs') {
            _forgeProxy('get', '/api/install')
                .then(r => send(res, r.status, r.body))
                .catch(e => send(res, 502, { error: e.message }));
            return;
        }
        if (m === 'POST' && url === '/api/install/jobs') {
            _forgeProxy('post', '/api/install', body)
                .then(r => send(res, r.status, r.body))
                .catch(e => send(res, 502, { error: e.message }));
            return;
        }
        const jobMatch = url.match(/^\/api\/install\/jobs\/([a-f0-9]+)$/);
        if (jobMatch) {
            if (m === 'GET') {
                _forgeProxy('get', `/api/install/${jobMatch[1]}`)
                    .then(r => send(res, r.status, r.body))
                    .catch(e => send(res, 502, { error: e.message }));
                return;
            }
            if (m === 'DELETE') {
                _forgeProxy('delete', `/api/install/${jobMatch[1]}`)
                    .then(r => send(res, r.status, r.body))
                    .catch(e => send(res, 502, { error: e.message }));
                return;
            }
        }
        send(res, 404, { error: 'Not found' }); return;
    }

    // ── Storage — skeleton (Disk Manager not yet implemented) ─────────────
    if (url.startsWith('/api/storage')) {
        send(res, 501, {
            error:  'Not implemented',
            detail: 'Storage / Disk Manager endpoints are reserved for a future release.',
        });
        return;
    }

    // ── Server list ───────────────────────────────────────────────────────

    if (m === 'GET' && url === '/api/servers') {
        send(res, 200, { servers: _getManagedServers().map(formatServer) });
        return;
    }

    // GET /api/servers/live — same as /api/servers but adds aggregate counts
    if (m === 'GET' && url === '/api/servers/live') {
        const servers = _getManagedServers().map(formatServer);
        send(res, 200, {
            servers,
            online: servers.filter(s => s.status === 'Online').length,
            total:  servers.length,
        });
        return;
    }

    // POST /api/servers — add a new server entry
    if (m === 'POST' && url === '/api/servers') {
        if (!_addServer) { send(res, 501, { error: 'Not implemented' }); return; }
        const { name, type, path: exePath } = body;
        if (!name || !type || !exePath) {
            send(res, 400, { error: 'name, type, and path are required' }); return;
        }
        try {
            const created = _addServer(body);
            send(res, 201, created);
        } catch (e) {
            send(res, 500, { error: e.message });
        }
        return;
    }

    // ── Routes with a server ID ──────────────────────────────────────────
    const srvMatch = url.match(/^\/api\/servers\/([^/]+)(\/.*)?$/);
    if (!srvMatch) {
        send(res, 404, { error: 'Not found' });
        return;
    }

    const srvId  = srvMatch[1];
    const srvSub = (srvMatch[2] || '').replace(/^\//, ''); // e.g. 'start', 'config', 'backups/restore'
    const srv    = _getManagedServers().find(s => s.id === srvId);

    if (!srv) {
        send(res, 404, { error: 'Server not found' });
        return;
    }

    // GET /api/servers/:id
    if (m === 'GET' && !srvSub) {
        send(res, 200, formatServer(srv));
        return;
    }

    // PUT /api/servers/:id — update server config
    if (m === 'PUT' && !srvSub) {
        if (!_updateServer) { send(res, 501, { error: 'Not implemented' }); return; }
        try {
            const updated = _updateServer(srvId, body);
            send(res, updated ? 200 : 404, updated || { error: 'Server not found' });
        } catch (e) {
            send(res, 500, { error: e.message });
        }
        return;
    }

    // DELETE /api/servers/:id — remove server entry (must be Offline)
    if (m === 'DELETE' && !srvSub) {
        if (!_deleteServer) { send(res, 501, { error: 'Not implemented' }); return; }
        if (srv.status === 'Online' || srv.status === 'Starting') {
            send(res, 409, { error: `Cannot delete a server that is ${srv.status}` }); return;
        }
        try {
            const ok = _deleteServer(srvId);
            send(res, ok ? 200 : 404, ok ? { deleted: true } : { error: 'Server not found' });
        } catch (e) {
            send(res, 500, { error: e.message });
        }
        return;
    }

    // POST /api/servers/:id/start
    if (m === 'POST' && srvSub === 'start') {
        if (srv.status === 'Online' || srv.status === 'Starting') {
            send(res, 409, { error: `Server is already ${srv.status}` });
            return;
        }
        _ipcMain.emit('start-server', makeReplyEvent(), { ...srv });
        send(res, 200, { message: `Start signal sent to ${srv.name}` });
        return;
    }

    // POST /api/servers/:id/stop
    if (m === 'POST' && srvSub === 'stop') {
        if (srv.status === 'Offline') {
            send(res, 409, { error: 'Server is already Offline' });
            return;
        }
        _ipcMain.emit('stop-server', makeReplyEvent(), srv.id);
        send(res, 200, { message: `Stop signal sent to ${srv.name}` });
        return;
    }

    // POST /api/servers/:id/restart
    if (m === 'POST' && srvSub === 'restart') {
        _ipcMain.emit('restart-server', makeReplyEvent(), srv.id);
        send(res, 200, { message: `Restart signal sent to ${srv.name}` });
        return;
    }

    // POST /api/servers/:id/kill
    if (m === 'POST' && srvSub === 'kill') {
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
    if (m === 'GET' && srvSub === 'logs') {
        const raw   = srv.logs || '';
        const lines = raw.split('\n');
        const tail  = lines.slice(-200).join('\n');
        send(res, 200, { id: srv.id, totalLines: lines.length, log: tail });
        return;
    }

    // GET /api/servers/:id/players
    if (m === 'GET' && srvSub === 'players') {
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
            .catch(err  => send(res, 500, { error: err.message }));
        return;
    }

    // POST /api/servers/:id/command
    if (m === 'POST' && srvSub === 'command') {
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

    // GET /api/servers/:id/config?filePath=...
    if (m === 'GET' && srvSub === 'config') {
        if (!_readConfigFile) { send(res, 501, { error: 'Not implemented' }); return; }
        const filePath = qs.get('filePath');
        if (!filePath) { send(res, 400, { error: 'filePath query parameter is required' }); return; }
        _readConfigFile(filePath)
            .then(r  => send(res, r.success ? 200 : 500, r))
            .catch(e => send(res, 500, { error: e.message }));
        return;
    }

    // POST /api/servers/:id/config — write (and optionally backup) a config file
    if (m === 'POST' && srvSub === 'config') {
        if (!_writeConfigFile) { send(res, 501, { error: 'Not implemented' }); return; }
        const { filePath, content, backupDir } = body;
        if (!filePath || content === undefined) {
            send(res, 400, { error: 'filePath and content are required' }); return;
        }
        _writeConfigFile({ filePath, content, backupDir: backupDir || null, serverType: srv.type, serverName: srv.name })
            .then(r  => send(res, r.success ? 200 : 500, r))
            .catch(e => send(res, 500, { error: e.message }));
        return;
    }

    // GET /api/servers/:id/backups?backupDir=...&fileName=...
    if (m === 'GET' && srvSub === 'backups') {
        if (!_listBackups) { send(res, 501, { error: 'Not implemented' }); return; }
        const backupDir = qs.get('backupDir');
        const fileName  = qs.get('fileName');
        if (!backupDir || !fileName) {
            send(res, 400, { error: 'backupDir and fileName query parameters are required' }); return;
        }
        _listBackups({ backupDir, serverType: srv.type, serverName: srv.name, fileName })
            .then(r  => send(res, r.success ? 200 : 500, r))
            .catch(e => send(res, 500, { error: e.message }));
        return;
    }

    // POST /api/servers/:id/backups/restore — copy a .bak file back to the original path
    if (m === 'POST' && srvSub === 'backups/restore') {
        if (!_readConfigFile || !_writeConfigFile) { send(res, 501, { error: 'Not implemented' }); return; }
        const { backupPath, targetPath } = body;
        if (!backupPath || !targetPath) {
            send(res, 400, { error: 'backupPath and targetPath are required' }); return;
        }
        _readConfigFile(backupPath)
            .then(r => {
                if (!r.success) { send(res, 500, r); return; }
                return _writeConfigFile({ filePath: targetPath, content: r.content, backupDir: null })
                    .then(wr => send(res, wr.success ? 200 : 500, wr));
            })
            .catch(e => send(res, 500, { error: e.message }));
        return;
    }

    send(res, 404, { error: 'Not found' });
}

// ── Forge proxy ───────────────────────────────────────────────────────────
// Routes a request to Forge's local HTTP API, translating the response back.
// Forge config (url + apiKey) is read from main.js via _getForgeConfig().

async function _forgeProxy(method, forgePath, data) {
    const cfg = _getForgeConfig ? _getForgeConfig() : null;
    if (!cfg || !cfg.url || !cfg.apiKey) {
        return {
            status: 503,
            body:   { error: 'Forge API not configured. Add forge-connection.json to RSM userData.' },
        };
    }
    const url  = `${cfg.url.replace(/\/$/, '')}${forgePath}`;
    const opts = {
        method,
        url,
        headers: { 'x-api-key': cfg.apiKey, 'Content-Type': 'application/json' },
        timeout: 30000,
    };
    if (data && Object.keys(data).length) opts.data = data;
    // Forge binds to 127.0.0.1 and may use a self-signed cert
    if (cfg.url.startsWith('https')) {
        opts.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }
    try {
        const resp = await axios(opts);
        return { status: resp.status, body: resp.data };
    } catch (err) {
        if (err.response) return { status: err.response.status, body: err.response.data };
        return { status: 502, body: { error: `Forge API unavailable: ${err.message}` } };
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

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
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    });
    res.end(buf);
}

function formatServer(srv) {
    const stats     = _getServerStats()[srv.id]     || {};
    const proc      = _getActiveProcesses()[srv.id] || {};
    const uptime    = proc.startedAt ? Math.floor((Date.now() - proc.startedAt) / 1000) : null;
    return {
        id:            srv.id,
        name:          srv.name,
        type:          srv.type,
        status:        srv.status,
        pid:           srv.pid     || null,
        cpu:           stats.cpu   ?? null,
        ramMB:         stats.ramMB ?? null,
        uptimeSeconds: uptime,
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
        const url = `http://localhost:${srv.apiPort}/vrageremote/v1/server/command`;
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
