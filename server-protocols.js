'use strict';

// Everything RSM says to a running game server over the network -- RCON, WebRCON,
// REST/HTTPS APIs, the Space Engineers VRage Remote API -- lives here, once.
// main.js (desktop UI + Citadel relay) and api-server.js (REST API) used to carry
// separate, diverging copies: the REST API still spoke plain Source RCON to Rust
// (which uses WebRCON) and a made-up header to Space Engineers, so commands and
// player lists that worked in the app failed over the API.
//
// All connections are to 127.0.0.1: RSM only ever manages servers on this machine.

const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const WebSocket = require('ws');
const { Rcon } = require('rcon-client');

const { parsePortNumber } = require('./powershell-safety');
const { parsePlayerListOutput } = require('./player-list-parser');
const vrageRemote = require('./vrage-remote-client');

const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_TIMEOUT_MILLISECONDS = 3000;

function requirePort(rawPort, label) {
    const port = parsePortNumber(rawPort);
    if (port === null) throw new Error(`${label} port is missing or invalid.`);
    return port;
}

// ── Source RCON (ARK, Conan Exiles, Project Zomboid, Soulmask, ...) ───────────

async function sendSourceRconCommand(server, command, timeoutMilliseconds = DEFAULT_TIMEOUT_MILLISECONDS) {
    const port = requirePort(server.apiPort, 'RCON');
    if (!server.apiPass) throw new Error('RCON password is required.');
    const rconConnection = await Rcon.connect({ host: LOOPBACK_HOST, port, password: server.apiPass, timeout: timeoutMilliseconds });
    try {
        return await rconConnection.send(command);
    } finally {
        try { rconConnection.end(); } catch { /* connection already closed */ }
    }
}

// ── Rust WebRCON ──────────────────────────────────────────────────────────────
// A WebSocket-based JSON protocol, not Source RCON. Connection format and message
// schema confirmed against Facepunch's own reference client
// (github.com/Facepunch/webrcon, js/rconService.js): connect to
// ws://host:port/password (the password is a raw URL path segment), send
// {Identifier, Message, Name: "WebRcon"} and match the reply by Identifier
// (values > 1000 are replies to us; <= 1000 are broadcast console lines).

function sendRustWebRconCommand(port, password, command, { timeoutMilliseconds = DEFAULT_TIMEOUT_MILLISECONDS, replyOptional = false } = {}) {
    return new Promise((resolve, reject) => {
        if (/[?#\s]/.test(password)) {
            reject(new Error('WebRCON password contains characters (?, # or spaces) that cannot be sent in the connection URL.'));
            return;
        }
        let isSettled = false;
        const identifier = 1001 + Math.floor(Math.random() * 100000);
        const socket = new WebSocket(`ws://${LOOPBACK_HOST}:${port}/${password}`);

        const finish = (settle, value) => {
            if (isSettled) return;
            isSettled = true;
            clearTimeout(timeoutHandle);
            try { socket.terminate(); } catch { /* already closed */ }
            settle(value);
        };
        // `quit` closes the socket before Rust answers; callers sending it
        // pass replyOptional so a missing reply counts as success.
        const finishWithoutReply = () => (replyOptional
            ? finish(resolve, '')
            : finish(reject, new Error('WebRCON connection closed before a reply arrived.')));

        const timeoutHandle = setTimeout(() => (replyOptional ? finish(resolve, '') : finish(reject, new Error('WebRCON timeout'))), timeoutMilliseconds);

        socket.on('open', () => socket.send(JSON.stringify({ Identifier: identifier, Message: command, Name: 'WebRcon' })));
        socket.on('message', (data) => {
            let parsedMessage;
            try { parsedMessage = JSON.parse(data.toString()); } catch { return; }
            if (parsedMessage && parsedMessage.Identifier === identifier) finish(resolve, parsedMessage.Message);
        });
        socket.on('error', (error) => finish(reject, error));
        socket.on('close', finishWithoutReply);
    });
}

// ── Palworld REST API (HTTP Basic, fixed user "admin") ────────────────────────

function palworldRequest(server, method, endpoint, body) {
    const port = requirePort(server.apiPort || 8212, 'Palworld REST API');
    const credentials = Buffer.from(`admin:${server.apiPass || ''}`).toString('base64');
    return axios({
        method,
        url: `http://${LOOPBACK_HOST}:${port}/v1/api${endpoint}`,
        headers: { Authorization: `Basic ${credentials}` },
        data: body,
        timeout: DEFAULT_TIMEOUT_MILLISECONDS,
    });
}

// ── Satisfactory HTTPS API (self-signed certificate, bearer-token login) ──────
// Same port as the game (7777). Log in first (password, or passwordless when
// FG.DedicatedServer.AllowInsecureLocalAccess=1), then call with the token. The
// two login functions return the token under differently cased field names.

async function queryClientAccessSatisfactory(server) {
    const port = requirePort(server.apiPort || 7777, 'Satisfactory API');
    const baseUrl = `https://${LOOPBACK_HOST}:${port}/api/v1`;
    // Satisfactory generates its own self-signed certificate on first run, so a
    // normal verification can never succeed. The agent is created per request,
    // used only for this hard-coded loopback address (traffic never leaves the
    // machine, so there is no network path for a man-in-the-middle), and is not
    // shared with any other connection.
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

    const loginBody = server.apiPass
        ? { function: 'PasswordLogin', data: { MinimumPrivilegeLevel: 'Client', Password: server.apiPass } }
        : { function: 'PasswordlessLogin', data: { MinimumPrivilegeLevel: 'Client' } };
    const loginResponse = await axios.post(baseUrl, loginBody, { httpsAgent, timeout: DEFAULT_TIMEOUT_MILLISECONDS });
    const token = loginResponse.data?.data?.AuthenticationToken || loginResponse.data?.data?.authenticationToken;
    if (!token) throw new Error('Satisfactory did not return an authentication token.');

    const stateResponse = await axios.post(
        baseUrl,
        { function: 'QueryServerState', data: {} },
        { httpsAgent, timeout: DEFAULT_TIMEOUT_MILLISECONDS, headers: { Authorization: `Bearer ${token}` } }
    );
    return stateResponse.data?.data?.serverGameState || {};
}

// ── Space Engineers VRage Remote API settings ─────────────────────────────────
// The API port and security key are saved on the server entry (apiPort/apiPass),
// but entries created before RSM read <RemoteSecurityKey> correctly have an empty
// key. Fall back to the instance's own SpaceEngineers-Dedicated.cfg so those
// servers work without the user having to retype the key.

function resolveSpaceEngineersRemoteSettings(server) {
    let port = parsePortNumber(server.apiPort);
    let securityKey = server.apiPass || '';

    if (!securityKey || port === null) {
        try {
            const configText = fs.readFileSync(path.join(server.workingDir || '', 'SpaceEngineers-Dedicated.cfg'), 'utf8');
            const readTag = (tagName) => {
                const tagMatch = configText.match(new RegExp(`<${tagName}>([^<]*)</${tagName}>`));
                return tagMatch ? tagMatch[1].trim() : '';
            };
            if (!securityKey) securityKey = readTag('RemoteSecurityKey');
            if (port === null) port = parsePortNumber(readTag('RemoteApiPort'));
        } catch { /* no readable config -- the request will report the missing key */ }
    }
    return { port: port ?? undefined, securityKey };
}

// ── Player counts ─────────────────────────────────────────────────────────────

// Resolves { online, max, players, world } for games reachable over the network,
// or null when this game has no network query (stdin-based games are handled by
// the console parser). Throws if the server cannot be reached.
async function queryPlayerCount(server) {
    const gameType = String(server.type || '').toLowerCase();

    if (gameType === 'space-engineers') {
        const remoteSettings = resolveSpaceEngineersRemoteSettings(server);
        const status = await vrageRemote.getServerStatus(remoteSettings);
        // Names come from a second route; the count above is authoritative if it fails.
        let players = [];
        try { players = await vrageRemote.getConnectedPlayers(remoteSettings); } catch { /* count alone is fine */ }
        return { online: status.Players ?? players.length, max: null, players, world: status.WorldName || null };
    }

    if (gameType === 'palworld') {
        const response = await palworldRequest(server, 'get', '/players');
        const players = (response.data?.players || []).map(player => player.name).filter(Boolean);
        return { online: players.length, max: null, players, world: null };
    }

    if (gameType === 'satisfactory') {
        const state = await queryClientAccessSatisfactory(server);
        const online = state.numConnectedPlayers;
        return { online: online ?? null, max: state.playerLimit ?? null, players: [], world: null };
    }

    if (gameType === 'rust') {
        const port = requirePort(server.apiPort, 'WebRCON');
        if (!server.apiPass) throw new Error('WebRCON password is required.');
        const rawReply = await sendRustWebRconCommand(port, server.apiPass, 'playerlist');
        const parsedPlayers = JSON.parse(rawReply || '[]');
        const players = Array.isArray(parsedPlayers) ? parsedPlayers.map(player => player.DisplayName).filter(Boolean) : [];
        return { online: players.length, max: null, players, world: null };
    }

    if (server.playerListCommand && server.apiPort && server.apiPass) {
        const reply = await sendSourceRconCommand(server, server.playerListCommand);
        return { ...parsePlayerListOutput(reply), world: null };
    }

    return null;
}

// ── Commands ──────────────────────────────────────────────────────────────────

// Space Engineers has no console-command endpoint (its Remote API publishes 32
// routes at GET /vrageremote/api, none of them a command runner). RSM gives the
// console a small command language that maps onto the routes that do the same
// jobs as the server's own admin screens. A leading "\" or "/" is accepted because
// older RSM versions sent "\save" and friends.

const SPACE_ENGINEERS_HELP = [
    'Space Engineers commands (sent through the Remote API):',
    '  save | status | players',
    '  grids | floating | characters | asteroids        list what is in the world',
    '  delete grid|floating|asteroid <id>               remove one',
    '  clear floating                                   remove every floating object',
    '  stop grid|floating|character <id>                halt its movement',
    '  power on|off <gridId>                            switch a grid\'s power',
    '  say <message> | chat                             send or read global chat',
    '  kick|unkick|ban|unban|promote|demote <steamId>   player administration',
    '  bans                                             list banned players',
    'Use the Stop button to save and stop the server.',
].join('\n');

const MAX_LISTED_ENTITIES = 40;
const SPACE_ENGINEERS_LIST_COMMANDS = { grids: 'grid', floating: 'floating', characters: 'character', asteroids: 'asteroid' };

function describeEntity(entity) {
    // Keen does not document the entity fields, so show the ones every kind has plus
    // whatever simple values the server sent, rather than assuming names.
    const parts = [`${entity.DisplayName || '(unnamed)'}  id ${entity.EntityId}`];
    for (const [key, value] of Object.entries(entity)) {
        if (key === 'DisplayName' || key === 'EntityId') continue;
        if (key === 'Position' && value && typeof value === 'object') {
            parts.push(`pos ${['X', 'Y', 'Z'].map(axis => Math.round(Number(value[axis]) || 0)).join(', ')}`);
        } else if (['string', 'number', 'boolean'].includes(typeof value)) {
            parts.push(`${key}=${value}`);
        }
    }
    return parts.join('  ');
}

function formatEntityList(entities, heading) {
    if (!entities.length) return `${heading}: none.`;
    const shown = entities.slice(0, MAX_LISTED_ENTITIES).map(entity => `  ${describeEntity(entity)}`);
    if (entities.length > MAX_LISTED_ENTITIES) shown.push(`  ... and ${entities.length - MAX_LISTED_ENTITIES} more`);
    return [`${heading} (${entities.length}):`, ...shown].join('\n');
}

async function runSpaceEngineersCommand(server, rawCommand) {
    const remoteSettings = resolveSpaceEngineersRemoteSettings(server);
    const words = String(rawCommand).trim().replace(/^[\\/]+/, '').split(/\s+/).filter(Boolean);
    const commandName = (words[0] || '').toLowerCase();
    const argument = words.slice(1).join(' ');

    if (SPACE_ENGINEERS_LIST_COMMANDS[commandName]) {
        const kindName = SPACE_ENGINEERS_LIST_COMMANDS[commandName];
        const entities = await vrageRemote.listEntities(remoteSettings, kindName);
        return formatEntityList(entities, commandName === 'floating' ? 'Floating objects' : commandName[0].toUpperCase() + commandName.slice(1));
    }

    switch (commandName) {
        case 'save':
            await vrageRemote.saveSession(remoteSettings);
            return 'World saved.';
        case 'status': {
            const status = await vrageRemote.getServerStatus(remoteSettings);
            return [
                `${status.ServerName || 'Server'} (${status.WorldName || 'unknown world'})`,
                `Ready: ${status.IsReady ? 'yes' : 'no'}  Players: ${status.Players ?? '?'}`,
                `Sim speed: ${status.SimSpeed ?? '?'}  Sim CPU load: ${status.SimulationCpuLoad ?? '?'}`,
                `PCU used: ${status.UsedPCU ?? '?'}  Version: ${status.Version ?? '?'}`,
            ].join('\n');
        }
        case 'players': {
            const playerNames = await vrageRemote.getConnectedPlayers(remoteSettings);
            return playerNames.length ? playerNames.map((name, index) => `${index + 1}. ${name}`).join('\n') : 'No players connected.';
        }
        case 'delete': {
            const [kindWord, entityId] = words.slice(1);
            const kindName = { grid: 'grid', floating: 'floating', asteroid: 'asteroid' }[(kindWord || '').toLowerCase()];
            if (!kindName) throw new Error('Usage: delete grid|floating|asteroid <id>');
            const removed = await vrageRemote.deleteEntity(remoteSettings, kindName, entityId);
            return `Deleted ${describeEntity(removed)}`;
        }
        case 'clear': {
            if ((words[1] || '').toLowerCase() !== 'floating') throw new Error('Usage: clear floating');
            const { found, remaining } = await vrageRemote.deleteAllEntities(remoteSettings, 'floating');
            if (!found) return 'No floating objects to remove.';
            return remaining ? `Removed ${found - remaining} of ${found} floating objects; ${remaining} remain.` : `Removed ${found} floating objects.`;
        }
        case 'stop': {
            const [kindWord, entityId] = words.slice(1);
            const kindName = { grid: 'grid', floating: 'floating', character: 'character' }[(kindWord || '').toLowerCase()];
            if (!kindName) throw new Error('Usage: stop grid|floating|character <id>');
            const stopped = await vrageRemote.stopEntityMovement(remoteSettings, kindName, entityId);
            return `Stopped ${describeEntity(stopped)}`;
        }
        case 'power': {
            const [state, gridId] = words.slice(1);
            const powered = { on: true, off: false }[(state || '').toLowerCase()];
            if (powered === undefined) throw new Error('Usage: power on|off <gridId>');
            const grid = await vrageRemote.setGridPower(remoteSettings, gridId, powered);
            return `Power ${powered ? 'on' : 'off'}: ${describeEntity(grid)}`;
        }
        case 'say':
            await vrageRemote.sendChatMessage(remoteSettings, argument);
            return 'Message sent.';
        case 'chat': {
            const messages = await vrageRemote.getChatMessages(remoteSettings);
            return messages.length ? messages.slice(-20).map(message => `${message.DisplayName || 'unknown'}: ${message.Content}`).join('\n') : 'No chat messages.';
        }
        case 'kick': case 'unkick': case 'ban': case 'unban': case 'promote': case 'demote':
            await vrageRemote.changePlayerStanding(remoteSettings, commandName, words[1]);
            // The server applies this on its game thread; `bans` shows the result a moment later.
            return `${commandName} sent for Steam id ${words[1]}.`;
        case 'bans': {
            const banned = await vrageRemote.getBannedPlayers(remoteSettings);
            return banned.length ? banned.map(entry => (typeof entry === 'object' ? JSON.stringify(entry) : String(entry))).join('\n') : 'No banned players.';
        }
        case 'help': case '?':
            return SPACE_ENGINEERS_HELP;
        default:
            throw new Error(`Unknown Space Engineers command "${commandName}".\n${SPACE_ENGINEERS_HELP}`);
    }
}

// Sends one console command to a network-controlled server and returns its reply.
async function sendNetworkCommand(server, command) {
    const gameType = String(server.type || '').toLowerCase();

    if (gameType === 'space-engineers') {
        return runSpaceEngineersCommand(server, command);
    }
    if (gameType === 'palworld' || gameType === 'satisfactory') {
        throw new Error('This game has no RCON console. Use its REST/HTTPS API features instead.');
    }
    if (gameType === 'rust') {
        const port = requirePort(server.apiPort, 'WebRCON');
        if (!server.apiPass) throw new Error('WebRCON password is required.');
        return sendRustWebRconCommand(port, server.apiPass, command);
    }
    return sendSourceRconCommand(server, command);
}

// ── Graceful stop ─────────────────────────────────────────────────────────────

const DELAY_BETWEEN_STOP_COMMANDS_MILLISECONDS = 1500;

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// Asks the server to save and shut itself down, using the transport the game's
// config declares (backend.gracefulStop.transport). Resolves true when the
// request was delivered. It does NOT wait for the process to exit -- the caller
// polls for that. Throws if the request could not be delivered.
//   stdin    -- write each command to the process's stdin (needs `standardInput`)
//   rcon     -- Source RCON            webrcon -- Rust WebRCON
//   palworld-rest -- save, then graceful shutdown with a short countdown
//   vrage-remote  -- Space Engineers DELETE /v1/server
async function requestGracefulStop(server, plan, { standardInput = null } = {}) {
    const commands = plan.commands || [];

    switch (plan.transport) {
        case 'stdin': {
            if (!standardInput || !standardInput.writable) throw new Error('Console input is not available.');
            for (const command of commands) {
                standardInput.write(`${command}\r\n`);
                await wait(DELAY_BETWEEN_STOP_COMMANDS_MILLISECONDS);
            }
            return true;
        }
        case 'rcon': {
            for (let index = 0; index < commands.length; index++) {
                const isFinalCommand = index === commands.length - 1;
                try {
                    await sendSourceRconCommand(server, commands[index]);
                } catch (error) {
                    // The final command shuts the server down, which can drop the connection before a reply.
                    if (!isFinalCommand) throw error;
                }
            }
            return true;
        }
        case 'webrcon': {
            const port = requirePort(server.apiPort, 'WebRCON');
            for (let index = 0; index < commands.length; index++) {
                const isFinalCommand = index === commands.length - 1;
                await sendRustWebRconCommand(port, server.apiPass, commands[index], { replyOptional: isFinalCommand });
            }
            return true;
        }
        case 'palworld-rest': {
            await palworldRequest(server, 'post', '/save');
            await palworldRequest(server, 'post', '/shutdown', { waittime: 5, message: 'Server is shutting down (Ronin Server Manager).' });
            return true;
        }
        case 'vrage-remote': {
            await vrageRemote.stopServer(resolveSpaceEngineersRemoteSettings(server));
            return true;
        }
        default:
            return false;
    }
}

module.exports = {
    queryPlayerCount,
    sendNetworkCommand,
    sendSourceRconCommand,
    sendRustWebRconCommand,
    requestGracefulStop,
};
