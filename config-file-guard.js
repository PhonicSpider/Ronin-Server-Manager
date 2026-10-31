'use strict';

// Decides which files the config editor (renderer IPC), the REST API and the
// Citadel relay may read or write. Before this existed, read-config-file /
// write-config-file / backups accepted ANY path, so anything holding the API key
// -- or a script running in the renderer -- could read servers.json (API keys,
// RCON passwords, the Citadel agent token) or overwrite arbitrary files.
//
// A path is allowed only when ALL of these hold:
//   1. it resolves (after following symlinks/junctions) inside a trusted folder:
//      a managed server's working directory or executable folder, or a folder
//      the user explicitly picked/was handed (install root, backup folder);
//   2. it has a plain-text configuration extension (no executables/scripts);
//   3. it contains no NUL bytes and no ".." tricks survive resolution.

const fs = require('fs');
const path = require('path');

const ALLOWED_CONFIG_EXTENSIONS = new Set([
    '.ini', '.cfg', '.conf', '.config', '.json', '.xml', '.txt',
    '.properties', '.yaml', '.yml', '.toml', '.lua', '.sbc', '.bak',
]);

const ALLOWED_ARCHIVE_EXTENSIONS = new Set(['.zip', '.7z', '.rar', '.tar', '.gz', '.tgz']);

function normalizeForComparison(filePath) {
    return path.normalize(filePath).toLowerCase();
}

// Resolves symlinks for the longest existing prefix of the path, so a junction
// inside a trusted folder pointing at C:\Windows cannot be used to escape it.
function resolveThroughSymlinks(targetPath) {
    const absolutePath = path.resolve(targetPath);
    const missingSegments = [];
    let existingPath = absolutePath;
    while (!fs.existsSync(existingPath)) {
        const parentPath = path.dirname(existingPath);
        if (parentPath === existingPath) break;
        missingSegments.unshift(path.basename(existingPath));
        existingPath = parentPath;
    }
    let realExistingPath = existingPath;
    try { realExistingPath = fs.realpathSync.native(existingPath); } catch { /* keep unresolved path */ }
    return path.join(realExistingPath, ...missingSegments);
}

function isInsideDirectory(parentDirectory, candidatePath) {
    const relativePath = path.relative(normalizeForComparison(parentDirectory), normalizeForComparison(candidatePath));
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

// A name used as ONE folder level in a backup tree. Server names are free text,
// so reject anything that could climb out of the backup folder.
function toSafePathSegment(rawSegment) {
    const segment = String(rawSegment ?? '').trim();
    if (segment === '' || segment === '.' || segment === '..' || /[\\/:*?"<>|\u0000-\u001F]/.test(segment)) {
        throw new Error(`"${segment}" cannot be used as a folder name.`);
    }
    return segment;
}

const MAXIMUM_PERSISTED_DIRECTORIES = 200;

// persistencePath: JSON file remembering folders the user picked, so a backup
// folder chosen last week (stored by the renderer) is still honoured after RSM
// restarts. defaultTrustedDirectories: folders RSM itself creates and owns.
function createConfigFileGuard({ listManagedServers, persistencePath = null, defaultTrustedDirectories = [] }) {
    const trustedDirectories = new Set();

    function persistTrustedDirectories() {
        if (!persistencePath) return;
        try {
            fs.writeFileSync(persistencePath, JSON.stringify([...trustedDirectories].slice(-MAXIMUM_PERSISTED_DIRECTORIES), null, 2));
        } catch (writeError) {
            console.warn(`[RSM] Could not persist trusted folders: ${writeError.message}`);
        }
    }

    // Remember a folder the user explicitly chose (folder picker, install root).
    function trustDirectory(directoryPath, { persist = true } = {}) {
        if (typeof directoryPath !== 'string' || directoryPath.includes('\u0000') || directoryPath.trim() === '') return;
        const resolvedDirectory = resolveThroughSymlinks(directoryPath);
        if (trustedDirectories.has(resolvedDirectory)) return;
        trustedDirectories.add(resolvedDirectory);
        if (persist) persistTrustedDirectories();
    }

    for (const defaultDirectory of defaultTrustedDirectories) trustDirectory(defaultDirectory, { persist: false });
    if (persistencePath && fs.existsSync(persistencePath)) {
        try {
            const storedDirectories = JSON.parse(fs.readFileSync(persistencePath, 'utf8'));
            if (Array.isArray(storedDirectories)) {
                for (const storedDirectory of storedDirectories) trustDirectory(storedDirectory, { persist: false });
            }
        } catch (readError) {
            console.warn(`[RSM] Could not read trusted folders: ${readError.message}`);
        }
    }

    // Remember the folder containing a file the user explicitly chose.
    function trustFileParent(filePath) {
        if (typeof filePath === 'string' && filePath.trim() !== '') trustDirectory(path.dirname(filePath));
    }

    function currentTrustedRoots() {
        const roots = new Set(trustedDirectories);
        for (const managedServer of listManagedServers()) {
            for (const candidate of [managedServer.workingDir, managedServer.path ? path.dirname(managedServer.path) : null]) {
                if (typeof candidate === 'string' && candidate.trim() !== '') roots.add(resolveThroughSymlinks(candidate));
            }
        }
        return roots;
    }

    function assertInsideTrustedRoot(resolvedPath) {
        for (const trustedRoot of currentTrustedRoots()) {
            if (isInsideDirectory(trustedRoot, resolvedPath)) return;
        }
        throw new Error('Access denied: that location is not part of a managed server or a folder you selected.');
    }

    function authorizeFile(filePath, allowedExtensions, fileKindDescription) {
        if (typeof filePath !== 'string' || filePath.trim() === '' || filePath.includes('\u0000')) {
            throw new Error('A valid file path is required.');
        }
        const resolvedPath = resolveThroughSymlinks(filePath);
        const extension = path.extname(resolvedPath).toLowerCase();
        if (!allowedExtensions.has(extension)) {
            throw new Error(`Access denied: "${extension || 'no extension'}" is not ${fileKindDescription}.`);
        }
        assertInsideTrustedRoot(resolvedPath);
        return resolvedPath;
    }

    // Returns the resolved, vetted path of a config file, or throws.
    function authorizeConfigFile(filePath) {
        return authorizeFile(filePath, ALLOWED_CONFIG_EXTENSIONS, 'an editable configuration file type');
    }

    // Returns the resolved, vetted path a downloaded game archive may be written to.
    function authorizeDownloadTarget(filePath) {
        return authorizeFile(filePath, ALLOWED_ARCHIVE_EXTENSIONS, 'a game archive file type');
    }

    // Returns the vetted per-server backup folder (<backupDir>/<type>/<name>).
    function authorizeBackupFolder(backupDir, serverType, serverName) {
        if (typeof backupDir !== 'string' || backupDir.trim() === '' || backupDir.includes('\u0000')) {
            throw new Error('A valid backup folder is required.');
        }
        const segments = [];
        if (serverType) segments.push(toSafePathSegment(serverType));
        segments.push(toSafePathSegment(serverName));
        const resolvedPath = resolveThroughSymlinks(path.join(path.resolve(backupDir), ...segments));
        assertInsideTrustedRoot(resolvedPath);
        return resolvedPath;
    }

    return { trustDirectory, trustFileParent, authorizeConfigFile, authorizeDownloadTarget, authorizeBackupFolder };
}

module.exports = { createConfigFileGuard, toSafePathSegment, ALLOWED_CONFIG_EXTENSIONS, ALLOWED_ARCHIVE_EXTENSIONS };
