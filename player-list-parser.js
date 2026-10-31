'use strict';

// Turns the text a game server prints for its "list players" command into
// { online, max, players }. Each game formats this differently, so the parser
// only reports a number when it positively recognises a format. When the text
// matches nothing it returns online: null ("unknown") -- never a made-up 0, which
// is what the old numbered-line-only check showed for every game whose output
// was not ARK-style.

const NO_PLAYERS_PATTERN = /\bno players?\b|\b0 players?\b|there are 0\b/i;

function unknownResult() {
    return { online: null, max: null, players: [] };
}

function parsePlayerListOutput(outputText) {
    const text = String(outputText ?? '').trim();
    if (text === '') return unknownResult();

    // Minecraft: "There are 2 of a max of 20 players online: Alice, Bob"
    const minecraftMatch = text.match(/There are (\d+) of a max(?: of)? (\d+) players online:?\s*(.*)/i);
    if (minecraftMatch) {
        const players = minecraftMatch[3].trim()
            ? minecraftMatch[3].split(',').map(name => name.trim()).filter(Boolean)
            : [];
        return { online: Number(minecraftMatch[1]), max: Number(minecraftMatch[2]), players };
    }

    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    // ARK-style numbered list: "1. PlayerName, 76561198000000000"
    const numberedLines = lines.filter(line => /^\d+\.\s/.test(line));
    if (numberedLines.length > 0) {
        const players = numberedLines.map(line => {
            const nameMatch = line.match(/^\d+\.\s+(.+?),/);
            return nameMatch ? nameMatch[1].trim() : line.replace(/^\d+\.\s*/, '').trim();
        });
        return { online: players.length, max: null, players };
    }

    // "Players connected (3):" header followed by "-Name" lines (Project Zomboid style)
    const headerMatch = text.match(/players? connected\s*\((\d+)\)/i);
    if (headerMatch) {
        const players = lines.filter(line => /^-\s*\S/.test(line)).map(line => line.replace(/^-\s*/, ''));
        return { online: Number(headerMatch[1]), max: null, players };
    }

    // Pipe-delimited table whose data rows start with an index: "0 | Fred | PlayerName | ..." (Conan style)
    const tableRows = lines.filter(line => /^\d+\s*\|/.test(line));
    if (tableRows.length > 0) {
        const players = tableRows.map(line => {
            const columns = line.split('|').map(column => column.trim());
            return columns[2] || columns[1] || columns[0];
        });
        return { online: players.length, max: null, players };
    }

    if (NO_PLAYERS_PATTERN.test(text)) return { online: 0, max: null, players: [] };

    return unknownResult();
}

module.exports = { parsePlayerListOutput };
