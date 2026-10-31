'use strict';

// RSM REST API--exposes server management over HTTPS so external tools
// (e.g. ArkenBot's rsm-manager addon, the Ronin Citadel portal) can control
// servers remotely.  Auth: x-api-key header, constant-time comparison.
// All requests/responses are application/json.

const axios  = require('axios');
const http   = require('http');
const https  = require('https');
const crypto = require('crypto');
const os     = require('os');
const { parsePlayerListOutput } = require('./player-list-parser');

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
        console.warn(`[RSM-API] Rate limit triggered for ${ip}--blocked for ${RATE_LIMIT_MS / 1000}s`);
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
// Network game protocols (RCON, WebRCON, REST/HTTPS, VRage) shared with the desktop UI
let _queryPlayerCount;
let _sendNetworkCommand;

// ── Runtime state ─────────────────────────────────────────────────────────
let _server   = null;
let _apiKey   = '';
let _port     = 3002;
// Default to loopback — the in-process Citadel agent reaches this over localhost.
// Binding 0.0.0.0 exposes the API to the whole LAN and must be an explicit opt-in.
let _bindHost = '127.0.0.1';
// CORS allow-origin. When null, send() derives a safe default from the bind host.
let _corsOrigin = null;

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
    _queryPlayerCount   = deps.queryPlayerCount     || null;
    _sendNetworkCommand = deps.sendNetworkCommand   || null;
    // Optional: explicit CORS allow-origin (e.g. a portal/LAN-tool origin). When
    // unset, send() falls back to a host-appropriate default.
    _corsOrigin         = deps.corsOrigin            || null;
}

// tlsOpts: { key, cert } for HTTPS, omit for plain HTTP (dev/fallback only).
// bindHost: interface to listen on. Defaults to 127.0.0.1 (loopback). Pass
// '0.0.0.0' to deliberately expose the API to the LAN (e.g. for ArkenBot).
function start(port, apiKey, tlsOpts, bindHost) {
    const newPort = port     || 3002;
    const newKey  = apiKey   || '';
    const newHost = bindHost || '127.0.0.1';

    // No-op if already listening on the same host/port with the same key
    if (_server && _port === newPort && _apiKey === newKey && _bindHost === newHost) return;

    _port     = newPort;
    _apiKey   = newKey;
    _bindHost = newHost;

    if (_server) {
        _server.close();
        _server = null;
    }

    _server = tlsOpts
        ? https.createServer(tlsOpts, onRequest)
        : http.createServer(onRequest);

    _server.listen(_port, _bindHost, () => {
        const scope = _bindHost === '0.0.0.0' ? 'LAN-exposed' : 'loopback';
        console.log(`[RSM-API] Listening on ${_bindHost}:${_port} (${tlsOpts ? 'HTTPS' : 'HTTP'}, ${scope})`);
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
        const bodyChunks = [];
        let receivedBytes = 0;
        let isTooLarge = false;
        req.on('data', chunk => {
            if (isTooLarge) return;
            receivedBytes += chunk.length;
            if (receivedBytes > MAX_BODY) {
                // Answer 413 and stop buffering; the old code destroyed the socket
                // and left the caller hanging with no response.
                isTooLarge = true;
                bodyChunks.length = 0;
                send(res, 413, { error: 'Request body too large' });
                return;
            }
            bodyChunks.push(chunk);
        });
        req.on('end', () => {
            if (isTooLarge) return;
            const rawBody = Buffer.concat(bodyChunks).toString('utf8');
            let body = {};
            if (rawBody.trim() !== '') {
                // A malformed body used to become {} silently, so e.g. a typo in a
                // firewall request surfaced as a confusing "field is required".
                try { body = JSON.parse(rawBody); } catch { send(res, 400, { error: 'Request body is not valid JSON' }); return; }
                if (body === null || typeof body !== 'object' || Array.isArray(body)) {
                    send(res, 400, { error: 'Request body must be a JSON object' }); return;
                }
            }
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
    const requestMethod        = req.method;

    // ── CORS pre-flight ──────────────────────────────────────────────────
    if (requestMethod === 'OPTIONS') {
        send(res, 204, null);
        return;
    }

    // ── Health check (unauthenticated--lets monitors confirm the API is up) ─
    if (requestMethod === 'GET' && url === '/api/health') {
        send(res, 200, { status: 'ok', version: _getAppVersion() });
        return;
    }

    // ── Rate limit check ─────────────────────────────────────────────────
    if (_isRateLimited(clientIp)) {
        console.warn(`[RSM-API] ${requestMethod} ${url}--429 blocked (${clientIp})`);
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
    console.log(`[RSM-API] ${requestMethod} ${url}--from ${clientIp}`);

    // ── System ───────────────────────────────────────────────────────────

    if (requestMethod === 'GET' && url === '/api/system/status') {
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
            onlineCount: servers.filter(server => server.status === 'Online').length,
        });
        return;
    }

    if (requestMethod === 'POST' && url === '/api/system/restart') {
        if (!_restartApp) { send(res, 501, { error: 'Not implemented' }); return; }
        send(res, 200, { message: 'RSM is restarting...' });
        setTimeout(() => _restartApp(), 500);
        return;
    }

    // ── Firewall ──────────────────────────────────────────────────────────

    if (url === '/api/firewall/rules') {
        if (requestMethod === 'GET') {
            if (!_getFirewallRules) { send(res, 501, { error: 'Not implemented' }); return; }
            _getFirewallRules()
                .then(rules => send(res, 200, { rules }))
                .catch(err  => send(res, 500, { error: err.message }));
            return;
        }
        if (requestMethod === 'POST') {
            if (!_addFirewallRule) { send(res, 501, { error: 'Not implemented' }); return; }
            const { displayName, port, tcp, udp } = body;
            if (!displayName || !port) {
                send(res, 400, { error: 'displayName and port are required' }); return;
            }
            if (!tcp && !udp) {
                send(res, 400, { error: 'At least one of tcp or udp must be true' }); return;
            }
            _addFirewallRule({ displayName, port, tcp: !!tcp, udp: !!udp })
                .then(result  => send(res, result.success ? 201 : 500, result))
                .catch(error => send(res, 500, { error: error.message }));
            return;
        }
        send(res, 405, { error: 'Method not allowed' }); return;
    }

    // DELETE /api/firewall/rules/:name  •  PATCH /api/firewall/rules/:name
    const fwMatch = url.match(/^\/api\/firewall\/rules\/(.+)$/);
    if (fwMatch) {
        // decodeURIComponent throws URIError on a stray '%'; uncaught here it would
        // surface as an error dialog in the desktop app instead of a 400.
        let ruleName;
        try { ruleName = decodeURIComponent(fwMatch[1]); } catch { send(res, 400, { error: 'Invalid rule name encoding' }); return; }
        if (requestMethod === 'DELETE') {
            if (!_removeFirewallRule) { send(res, 501, { error: 'Not implemented' }); return; }
            _removeFirewallRule(ruleName)
                .then(result  => send(res, result.success ? 200 : 500, result))
                .catch(error => send(res, 500, { error: error.message }));
            return;
        }
        if (requestMethod === 'PATCH') {
            if (!_toggleFirewallRule) { send(res, 501, { error: 'Not implemented' }); return; }
            if (typeof body.enabled !== 'boolean') {
                send(res, 400, { error: 'enabled (boolean) is required' }); return;
            }
            _toggleFirewallRule(ruleName, body.enabled)
                .then(result  => send(res, result.success ? 200 : 500, result))
                .catch(error => send(res, 500, { error: error.message }));
            return;
        }
        send(res, 405, { error: 'Method not allowed' }); return;
    }

    // ── Install / Forge proxy ─────────────────────────────────────────────
    // RSM proxies install requests to Forge's local API so the portal only
    // needs to talk to a single endpoint.  Configure the Forge connection
    // URL + key via forge-connection.json in RSM's userData directory.

    if (url.startsWith('/api/install')) {
        if (requestMethod === 'GET' && url === '/api/install/games') {
            _forgeProxy('get', '/api/games')
                .then(result => send(res, result.status, result.body))
                .catch(error => send(res, 502, { error: error.message }));
            return;
        }
        if (requestMethod === 'GET' && url === '/api/install/jobs') {
            _forgeProxy('get', '/api/install')
                .then(result => send(res, result.status, result.body))
                .catch(error => send(res, 502, { error: error.message }));
            return;
        }
        if (requestMethod === 'POST' && url === '/api/install/jobs') {
            _forgeProxy('post', '/api/install', body)
                .then(result => send(res, result.status, result.body))
                .catch(error => send(res, 502, { error: error.message }));
            return;
        }
        const jobMatch = url.match(/^\/api\/install\/jobs\/([a-f0-9]+)$/);
        if (jobMatch) {
            if (requestMethod === 'GET') {
                _forgeProxy('get', `/api/install/${jobMatch[1]}`)
                    .then(result => send(res, result.status, result.body))
                    .catch(error => send(res, 502, { error: error.message }));
                return;
            }
            if (requestMethod === 'DELETE') {
                _forgeProxy('delete', `/api/install/${jobMatch[1]}`)
                    .then(result => send(res, result.status, result.body))
                    .catch(error => send(res, 502, { error: error.message }));
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

    if (requestMethod === 'GET' && url === '/api/servers') {
        send(res, 200, { servers: _getManagedServers().map(formatServer) });
        return;
    }

    // GET /api/servers/live — same as /api/servers but adds aggregate counts
    if (requestMethod === 'GET' && url === '/api/servers/live') {
        const servers = _getManagedServers().map(formatServer);
        send(res, 200, {
            servers,
            online: servers.filter(server => server.status === 'Online').length,
            total:  servers.length,
        });
        return;
    }

    // POST /api/servers — add a new server entry
    if (requestMethod === 'POST' && url === '/api/servers') {
        if (!_addServer) { send(res, 501, { error: 'Not implemented' }); return; }
        const { name, type, path: exePath } = body;
        if (!name || !type || !exePath) {
            send(res, 400, { error: 'name, type, and path are required' }); return;
        }
        try {
            const created = _addServer(body);
            send(res, 201, created);
        } catch (error) {
            send(res, 500, { error: error.message });
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
    const srv    = _getManagedServers().find(managedServer => managedServer.id === srvId);

    if (!srv) {
        send(res, 404, { error: 'Server not found' });
        return;
    }

    // GET /api/servers/:id
    if (requestMethod === 'GET' && !srvSub) {
        send(res, 200, formatServer(srv));
        return;
    }

    // PUT /api/servers/:id — update server config
    if (requestMethod === 'PUT' && !srvSub) {
        if (!_updateServer) { send(res, 501, { error: 'Not implemented' }); return; }
        try {
            const updated = _updateServer(srvId, body);
            send(res, updated ? 200 : 404, updated || { error: 'Server not found' });
        } catch (error) {
            send(res, 500, { error: error.message });
        }
        return;
    }

    // DELETE /api/servers/:id — remove server entry (must be Offline)
    if (requestMethod === 'DELETE' && !srvSub) {
        if (!_deleteServer) { send(res, 501, { error: 'Not implemented' }); return; }
        if (srv.status === 'Online' || srv.status === 'Starting') {
            send(res, 409, { error: `Cannot delete a server that is ${srv.status}` }); return;
        }
        try {
            const ok = _deleteServer(srvId);
            send(res, ok ? 200 : 404, ok ? { deleted: true } : { error: 'Server not found' });
        } catch (error) {
            send(res, 500, { error: error.message });
        }
        return;
    }

    // POST /api/servers/:id/start
    if (requestMethod === 'POST' && srvSub === 'start') {
        if (srv.status === 'Online' || srv.status === 'Starting') {
            send(res, 409, { error: `Server is already ${srv.status}` });
            return;
        }
        _ipcMain.emit('start-server', makeReplyEvent(), { ...srv });
        send(res, 200, { message: `Start signal sent to ${srv.name}` });
        return;
    }

    // POST /api/servers/:id/stop
    if (requestMethod === 'POST' && srvSub === 'stop') {
        if (srv.status === 'Offline') {
            send(res, 409, { error: 'Server is already Offline' });
            return;
        }
        _ipcMain.emit('stop-server', makeReplyEvent(), srv.id);
        send(res, 200, { message: `Stop signal sent to ${srv.name}` });
        return;
    }

    // POST /api/servers/:id/restart
    if (requestMethod === 'POST' && srvSub === 'restart') {
        _ipcMain.emit('restart-server', makeReplyEvent(), srv.id);
        send(res, 200, { message: `Restart signal sent to ${srv.name}` });
        return;
    }

    // POST /api/servers/:id/kill
    // Hard kill via taskkill--use when stop is unresponsive.
    if (requestMethod === 'POST' && srvSub === 'kill') {
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
    if (requestMethod === 'GET' && srvSub === 'logs') {
        const raw   = srv.logs || '';
        const lines = raw.split('\n');
        const tail  = lines.slice(-200).join('\n');
        send(res, 200, { id: srv.id, totalLines: lines.length, log: tail });
        return;
    }

    // GET /api/servers/:id/players
    if (requestMethod === 'GET' && srvSub === 'players') {
        if (srv.status !== 'Online') {
            send(res, 409, { error: 'Server is not running' });
            return;
        }
        const processInfo = _getActiveProcesses()[srv.id];
        if (!processInfo) {
            send(res, 409, { error: 'Server process not attached--restart the server through RSM to enable this endpoint' });
            return;
        }
        fetchPlayers(srv, processInfo)
            .then(data => send(res, 200, data))
            .catch(err  => send(res, 500, { error: err.message }));
        return;
    }

    // POST /api/servers/:id/command
    if (requestMethod === 'POST' && srvSub === 'command') {
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
    if (requestMethod === 'GET' && srvSub === 'config') {
        if (!_readConfigFile) { send(res, 501, { error: 'Not implemented' }); return; }
        const filePath = qs.get('filePath');
        if (!filePath) { send(res, 400, { error: 'filePath query parameter is required' }); return; }
        _readConfigFile(filePath)
            .then(result  => send(res, result.success ? 200 : 500, result))
            .catch(error => send(res, 500, { error: error.message }));
        return;
    }

    // POST /api/servers/:id/config — write (and optionally backup) a config file
    if (requestMethod === 'POST' && srvSub === 'config') {
        if (!_writeConfigFile) { send(res, 501, { error: 'Not implemented' }); return; }
        const { filePath, content, backupDir } = body;
        if (!filePath || content === undefined) {
            send(res, 400, { error: 'filePath and content are required' }); return;
        }
        _writeConfigFile({ filePath, content, backupDir: backupDir || null, serverType: srv.type, serverName: srv.name })
            .then(result  => send(res, result.success ? 200 : 500, result))
            .catch(error => send(res, 500, { error: error.message }));
        return;
    }

    // GET /api/servers/:id/backups?backupDir=...&fileName=...
    if (requestMethod === 'GET' && srvSub === 'backups') {
        if (!_listBackups) { send(res, 501, { error: 'Not implemented' }); return; }
        const backupDir = qs.get('backupDir');
        const fileName  = qs.get('fileName');
        if (!backupDir || !fileName) {
            send(res, 400, { error: 'backupDir and fileName query parameters are required' }); return;
        }
        _listBackups({ backupDir, serverType: srv.type, serverName: srv.name, fileName })
            .then(result  => send(res, result.success ? 200 : 500, result))
            .catch(error => send(res, 500, { error: error.message }));
        return;
    }

    // POST /api/servers/:id/backups/restore — copy a .bak file back to the original path
    if (requestMethod === 'POST' && srvSub === 'backups/restore') {
        if (!_readConfigFile || !_writeConfigFile) { send(res, 501, { error: 'Not implemented' }); return; }
        const { backupPath, targetPath } = body;
        if (!backupPath || !targetPath) {
            send(res, 400, { error: 'backupPath and targetPath are required' }); return;
        }
        _readConfigFile(backupPath)
            .then(result => {
                if (!result.success) { send(res, 500, result); return; }
                return _writeConfigFile({ filePath: targetPath, content: result.content, backupDir: null })
                    .then(wr => send(res, wr.success ? 200 : 500, wr));
            })
            .catch(error => send(res, 500, { error: error.message }));
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
    // CORS origin: explicit deps.corsOrigin wins. Otherwise default to
    // 'http://localhost' on loopback, and only fall back to wildcard when the
    // operator has deliberately exposed the API to the LAN (bindHost 0.0.0.0).
    const allowOrigin = _corsOrigin || (_bindHost === '0.0.0.0' ? '*' : 'http://localhost');
    res.writeHead(statusCode, {
        'Content-Type':   'application/json',
        'Content-Length': buf.length,
        'Connection':     'close',
        // Responses can contain server logs and config files -- never cache them
        // and never let a browser second-guess the declared type.
        'Cache-Control':          'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin':  allowOrigin,
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

// Sends one command to a running server and resolves with its reply text.
// DIRECT_CONSOLE servers (Minecraft, Terraria, 7 Days to Die, Project Zomboid)
// take commands on stdin, so capture whatever they print back for 1.5 s. Every
// other game is reached through the shared network protocols (Source RCON,
// Rust WebRCON, ...) -- the same code the desktop UI uses, so a command that
// works in the app works here too.
async function executeCommand(srv, processInfo, command) {
    if (_findServType(srv) === 'DIRECT_CONSOLE') {
        const childProcess = processInfo.shell;
        if (!childProcess?.stdin?.writable) throw new Error('Console stdin is not available');

        return new Promise((resolve) => {
            const outputChunks = [];
            const collectOutput = (data) => outputChunks.push(data.toString());
            childProcess.stdout.on('data', collectOutput);
            childProcess.stdin.write(command + '\n');

            setTimeout(() => {
                childProcess.stdout.off('data', collectOutput);
                resolve(outputChunks.join('').trim() || '(no output)');
            }, 1500);
        });
    }

    if (!_sendNetworkCommand) throw new Error('Network commands are not available');
    const reply = await _sendNetworkCommand(srv, command);
    return reply || 'Command sent';
}

async function fetchPlayers(srv, processInfo) {
    // Games reachable over the network (Space Engineers VRage API, Palworld REST,
    // Satisfactory HTTPS API, Rust WebRCON, Source RCON) answer through the shared
    // protocol module. Games with nothing to query fall through to the console.
    if (_queryPlayerCount) {
        const networkResult = await _queryPlayerCount(srv);
        if (networkResult && networkResult.online !== null) {
            return { online: networkResult.online, max: networkResult.max, players: networkResult.players };
        }
    }

    // Everything else: send the command defined in the game config and parse the output.
    // New games never need to touch this function -- just set backend.playerListCommand in their config.
    if (!srv.playerListCommand) {
        return { online: null, max: null, players: [], note: 'Player list not supported for this server type' };
    }

    const output = await executeCommand(srv, processInfo, srv.playerListCommand);
    const parsedPlayers = parsePlayerListOutput(output);
    if (parsedPlayers.online !== null) return parsedPlayers;

    // Unrecognised format -- return the raw text for the caller to interpret
    return { online: null, max: null, players: [], rawOutput: output.trim() };
}

module.exports = { init, start, stop, generateApiKey };
