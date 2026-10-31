'use strict';

// Minimal client for the Space Engineers dedicated server "VRage Remote API".
//
// Authentication (documented by Keen and implemented by go-vrage): every
// request carries
//     Date:          <UTC date>
//     Authorization: <nonce>:<base64(HMAC-SHA1(key, path CRLF nonce CRLF date CRLF))>
// where `path` is the request path (e.g. /vrageremote/v1/server) and `key` is the
// <RemoteSecurityKey> from SpaceEngineers-Dedicated.cfg (base64-decoded).
//
// RSM previously sent a made-up "Remote-Control-Http-Password" header and Basic
// auth to /v1/session -- neither exists in the real API, so SE player counts and
// commands could never have authenticated.

const crypto = require('crypto');
const http = require('http');

const BASE_ENDPOINT = '/vrageremote';
const DEFAULT_PORT = 8080;
const REQUEST_TIMEOUT_MILLISECONDS = 4000;

function buildAuthorizationHeaders(requestPath, securityKey) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const date = new Date().toUTCString(); // RFC 1123, e.g. "Sat, 22 Aug 2026 14:50:43 GMT"
    const payload = `${requestPath}\r\n${nonce}\r\n${date}\r\n`;

    // The cfg stores the key base64-encoded; fall back to the raw text if it is not valid base64.
    const looksLikeBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(securityKey) && securityKey.length % 4 === 0;
    const keyBytes = looksLikeBase64 ? Buffer.from(securityKey, 'base64') : Buffer.from(securityKey, 'utf8');
    const signature = crypto.createHmac('sha1', keyBytes).update(payload, 'utf8').digest('base64');

    return { Date: date, Authorization: `${nonce}:${signature}` };
}

// Resolves { statusCode, data } for any HTTP status; rejects only on network
// failure/timeouts so callers can map 403 to "wrong security key".
function requestVrageRemote({ port = DEFAULT_PORT, securityKey, method = 'GET', endpoint, body = null }) {
    return new Promise((resolve, reject) => {
        if (!securityKey) {
            reject(new Error('Space Engineers Remote API security key is not set (RemoteSecurityKey in SpaceEngineers-Dedicated.cfg).'));
            return;
        }
        const requestPath = `${BASE_ENDPOINT}${endpoint}`;
        const payloadText = body === null ? null : JSON.stringify(body);
        const requestHeaders = { ...buildAuthorizationHeaders(requestPath, securityKey), 'Content-Type': 'application/json' };
        if (payloadText !== null) requestHeaders['Content-Length'] = Buffer.byteLength(payloadText);

        const request = http.request(
            { host: '127.0.0.1', port, path: requestPath, method, headers: requestHeaders, timeout: REQUEST_TIMEOUT_MILLISECONDS },
            (response) => {
                const chunks = [];
                response.on('data', chunk => chunks.push(chunk));
                response.on('end', () => {
                    // Entity and Steam IDs are 17-20 digit integers, past what a JS number holds
                    // exactly (JSON.parse would round them), so quote them before parsing.
                    const text = Buffer.concat(chunks).toString('utf8')
                        .replace(/("(?:EntityId|IdentityId|SteamID|SteamId|PlayerId|ServerId|OwnerId)"\s*:\s*)(\d{16,})/g, '$1"$2"');
                    let data = null;
                    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
                    resolve({ statusCode: response.statusCode, data });
                });
            }
        );
        request.on('timeout', () => request.destroy(new Error('Space Engineers Remote API timed out.')));
        request.on('error', reject);
        if (payloadText !== null) request.write(payloadText);
        request.end();
    });
}

function describeFailure(statusCode) {
    if (statusCode === 403) return 'security key is invalid or missing (check RemoteSecurityKey)';
    if (statusCode === 503) return 'Remote API is not initialised yet (server still starting?)';
    return `unexpected HTTP ${statusCode}`;
}

// GET /v1/server -> { Players, SimSpeed, ServerName, WorldName, IsReady, ... }
// Names come from GET /v1/session/players (getConnectedPlayers below).
async function getServerStatus({ port, securityKey }) {
    const { statusCode, data } = await requestVrageRemote({ port, securityKey, endpoint: '/v1/server' });
    if (statusCode !== 200) throw new Error(`Space Engineers Remote API: ${describeFailure(statusCode)}`);
    return (data && data.data) || data || {};
}

// GET /v1/session/players -> the players currently connected. Verified against a
// live server (the server publishes its own route list at GET /vrageremote/api).
async function getConnectedPlayers({ port, securityKey }) {
    const { statusCode, data } = await requestVrageRemote({ port, securityKey, endpoint: '/v1/session/players' });
    if (statusCode !== 200) throw new Error(`Space Engineers Remote API: ${describeFailure(statusCode)}`);
    const playerList = (data && data.data && data.data.Players) || [];
    return playerList.map(player => player.DisplayName || player.Name || player.displayName || String(player.SteamID || player.SteamId || 'unknown'));
}

// PATCH /v1/session -> "Saves current session" (same as the server's own autosave).
async function saveSession({ port, securityKey }) {
    const { statusCode } = await requestVrageRemote({ port, securityKey, method: 'PATCH', endpoint: '/v1/session' });
    if (statusCode < 200 || statusCode >= 300) throw new Error(`Space Engineers Remote API: ${describeFailure(statusCode)}`);
}

// DELETE /v1/server -> asks the dedicated server to stop (it saves first).
async function stopServer({ port, securityKey }) {
    const { statusCode } = await requestVrageRemote({ port, securityKey, method: 'DELETE', endpoint: '/v1/server' });
    if (statusCode < 200 || statusCode >= 300) throw new Error(`Space Engineers Remote API: ${describeFailure(statusCode)}`);
}

// ── World entities ────────────────────────────────────────────────────────────
// Verified against a live server's route list (GET /vrageremote/api). Each kind has
// GET /v1/session/<route> -> { data: { <listKey>: [...] } } and DELETE/PATCH on
// /<route>/{entityId}. Keen does not document the item fields; the live planets
// list shows { DisplayName, EntityId, Position }, and grids/floating objects are
// assumed to follow the same pattern, so callers must not rely on any other field.

const ENTITY_KINDS = {
    grid:     { route: 'grids',          listKey: 'Grids',          label: 'grid',            canDelete: true,  canStop: true },
    floating: { route: 'floatingObjects', listKey: 'FloatingObjects', label: 'floating object', canDelete: true,  canStop: true },
    asteroid: { route: 'asteroids',      listKey: 'Asteroids',      label: 'asteroid',        canDelete: true,  canStop: false },
    character: { route: 'characters',    listKey: 'Characters',     label: 'character',       canDelete: false, canStop: true },
};

const IDENTIFIER_PATTERN = /^\d{1,20}$/;

function requireIdentifier(value, description) {
    const text = String(value ?? '').trim();
    if (!IDENTIFIER_PATTERN.test(text)) throw new Error(`${description} must be a number (digits only).`);
    return text;
}

function requireEntityKind(kindName) {
    const kind = ENTITY_KINDS[kindName];
    if (!kind) throw new Error(`Unknown entity type "${kindName}". Use: ${Object.keys(ENTITY_KINDS).join(', ')}.`);
    return kind;
}

async function expectSuccess(settings, request) {
    const { statusCode, data } = await requestVrageRemote({ ...settings, ...request });
    if (statusCode < 200 || statusCode >= 300) {
        const serverMessage = data && data.error && data.error.message;
        throw new Error(`Space Engineers Remote API: ${serverMessage || describeFailure(statusCode)}`);
    }
    return (data && data.data) || {};
}

async function listEntities(settings, kindName) {
    const kind = requireEntityKind(kindName);
    const payload = await expectSuccess(settings, { endpoint: `/v1/session/${kind.route}` });
    return payload[kind.listKey] || [];
}

// The server answers 200 for an unknown entity id (it silently does nothing), so
// every change first checks the id against the live list and reports "not found".
async function findEntity(settings, kindName, entityId) {
    const cleanId = requireIdentifier(entityId, 'Entity id');
    const entities = await listEntities(settings, kindName);
    const found = entities.find(entity => String(entity.EntityId) === cleanId);
    if (!found) throw new Error(`No ${requireEntityKind(kindName).label} with id ${cleanId} exists (use the list command to see current ids).`);
    return found;
}

async function deleteEntity(settings, kindName, entityId) {
    const kind = requireEntityKind(kindName);
    if (!kind.canDelete) throw new Error(`Deleting a ${kind.label} is not supported by the Remote API.`);
    const found = await findEntity(settings, kindName, entityId);
    await expectSuccess(settings, { method: 'DELETE', endpoint: `/v1/session/${kind.route}/${found.EntityId}` });
    return found;
}

async function stopEntityMovement(settings, kindName, entityId) {
    const kind = requireEntityKind(kindName);
    if (!kind.canStop) throw new Error(`Stopping a ${kind.label} is not supported by the Remote API.`);
    const found = await findEntity(settings, kindName, entityId);
    await expectSuccess(settings, { method: 'PATCH', endpoint: `/v1/session/${kind.route}/${found.EntityId}` });
    return found;
}

// Deletes every entity of one kind (e.g. all floating objects). Lists once, deletes
// each, then re-lists so the reply reports what actually went away.
async function deleteAllEntities(settings, kindName) {
    const kind = requireEntityKind(kindName);
    if (!kind.canDelete) throw new Error(`Deleting a ${kind.label} is not supported by the Remote API.`);
    const before = await listEntities(settings, kindName);
    for (const entity of before) {
        await expectSuccess(settings, { method: 'DELETE', endpoint: `/v1/session/${kind.route}/${requireIdentifier(entity.EntityId, 'Entity id')}` });
    }
    // The server applies deletions on its game thread, so a list read straight after
    // still shows them; give it a moment (and one retry) before counting leftovers.
    let remaining = before.length;
    for (const settleMilliseconds of [800, 2000]) {
        await new Promise(resolve => setTimeout(resolve, settleMilliseconds));
        remaining = (await listEntities(settings, kindName)).length;
        if (remaining === 0) break;
    }
    return { found: before.length, remaining };
}

// POST turns the grid's power on, DELETE turns it off.
async function setGridPower(settings, entityId, powered) {
    const found = await findEntity(settings, 'grid', entityId);
    await expectSuccess(settings, { method: powered ? 'POST' : 'DELETE', endpoint: `/v1/session/poweredGrids/${found.EntityId}` });
    return found;
}

// ── Chat ──────────────────────────────────────────────────────────────────────
// POST /v1/session/chat takes the message as a bare JSON string (an object body
// such as {"Message": "..."} is answered with HTTP 500). Verified against a live server.

async function sendChatMessage(settings, message) {
    const text = String(message ?? '').trim();
    if (!text) throw new Error('Chat message is empty.');
    if (text.length > 512) throw new Error('Chat message is too long (512 characters maximum).');
    await expectSuccess(settings, { method: 'POST', endpoint: '/v1/session/chat', body: text });
}

async function getChatMessages(settings) {
    const payload = await expectSuccess(settings, { endpoint: '/v1/session/chat' });
    return payload.Messages || [];
}

// ── Player administration ─────────────────────────────────────────────────────
// Each action is a POST (apply) or DELETE (undo) on /v1/admin/<route>/{steamId}.

const PLAYER_ACTIONS = {
    kick:    { method: 'POST',   route: 'kickedPlayers',   listKey: 'KickedPlayers' },
    unkick:  { method: 'DELETE', route: 'kickedPlayers',   listKey: 'KickedPlayers' },
    ban:     { method: 'POST',   route: 'bannedPlayers',   listKey: 'BannedPlayers' },
    unban:   { method: 'DELETE', route: 'bannedPlayers',   listKey: 'BannedPlayers' },
    promote: { method: 'POST',   route: 'promotedPlayers', listKey: null },
    demote:  { method: 'DELETE', route: 'promotedPlayers', listKey: null },
};

async function changePlayerStanding(settings, actionName, steamId) {
    const action = PLAYER_ACTIONS[actionName];
    if (!action) throw new Error(`Unknown player action "${actionName}". Use: ${Object.keys(PLAYER_ACTIONS).join(', ')}.`);
    const cleanId = requireIdentifier(steamId, 'Steam id');
    await expectSuccess(settings, { method: action.method, endpoint: `/v1/admin/${action.route}/${cleanId}` });
}

async function getBannedPlayers(settings) {
    const payload = await expectSuccess(settings, { endpoint: '/v1/admin/bannedPlayers' });
    return payload.BannedPlayers || [];
}

module.exports = {
    getServerStatus, getConnectedPlayers, saveSession, stopServer, requestVrageRemote, buildAuthorizationHeaders,
    ENTITY_KINDS, listEntities, deleteEntity, deleteAllEntities, stopEntityMovement, setGridPower,
    sendChatMessage, getChatMessages, changePlayerStanding, getBannedPlayers,
};
