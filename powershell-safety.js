'use strict';

// Helpers for building PowerShell scripts from values that did not originate in
// this file (server names, firewall rule names, ports, paths). Every script RSM
// runs is delivered with -EncodedCommand, which avoids cmd.exe quoting problems,
// but the *contents* of the script are still PowerShell source -- so any value
// interpolated into it must be escaped for the context it lands in, or it can
// end the string/argument it was meant to stay inside and run as code.

const { execFile } = require('child_process');

const MINIMUM_PORT_NUMBER = 1;
const MAXIMUM_PORT_NUMBER = 65535;
const MAXIMUM_NAME_LENGTH = 256;
const POWERSHELL_TIMEOUT_MILLISECONDS = 60_000;
const POWERSHELL_MAXIMUM_OUTPUT_BYTES = 10 * 1024 * 1024;

// Returns the port as an integer, or null when it is not a whole number in the
// valid TCP/UDP range. Port values are interpolated unquoted (-LocalPort 1234),
// so anything but a validated integer must never reach a script.
function parsePortNumber(rawPort) {
    if (typeof rawPort === 'string' && !/^\d{1,5}$/.test(rawPort.trim())) return null;
    const portNumber = Number(rawPort);
    const isValid = Number.isInteger(portNumber)
        && portNumber >= MINIMUM_PORT_NUMBER
        && portNumber <= MAXIMUM_PORT_NUMBER;
    return isValid ? portNumber : null;
}

// Returns the process id as a positive integer, or null. Used before a pid is
// handed to taskkill/Stop-Process/Get-Process.
function parseProcessId(rawProcessId) {
    const processId = Number(rawProcessId);
    return Number.isInteger(processId) && processId > 0 && processId <= 0xFFFFFFFF ? processId : null;
}

// Escapes text for the inside of a PowerShell *single-quoted* string. Inside
// single quotes the only special character is the quote itself, written twice
// to mean one literal quote. PowerShell also treats the four Unicode "smart"
// single quotes (U+2018, U+2019, U+201A, U+201B) as quote characters, so a name
// containing one of those ends the string just like an ASCII apostrophe --
// escaping only ' (the common mistake) leaves a command-injection hole.
function escapePowerShellLiteral(text) {
    return String(text).replace(/['‘’‚‛]/g, quoteCharacter => quoteCharacter + quoteCharacter);
}

// Escapes the wildcard characters understood by -like / -notlike so a value is
// matched literally. The backtick is PowerShell's escape character in patterns.
function escapePowerShellWildcard(text) {
    return String(text).replace(/[\[\]*?`]/g, wildcardCharacter => '`' + wildcardCharacter);
}

// Quote + wildcard-escape in one step, for the right-hand side of -like.
function toPowerShellLikePattern(text) {
    return escapePowerShellLiteral(escapePowerShellWildcard(text));
}

// Validates a display name before it is used in a script or shown back to the
// user. Rejects empty values, control characters and absurd lengths.
function validateDisplayName(rawName, label = 'Name') {
    if (typeof rawName !== 'string' || rawName.trim() === '') {
        throw new Error(`${label} is required.`);
    }
    if (rawName.length > MAXIMUM_NAME_LENGTH) {
        throw new Error(`${label} must be ${MAXIMUM_NAME_LENGTH} characters or fewer.`);
    }
    if (/[\u0000-\u001F\u007F]/.test(rawName)) {
        throw new Error(`${label} contains control characters.`);
    }
    return rawName;
}

// Runs a script through powershell.exe without a shell. Resolves (never rejects)
// with { error, stdout, stderr } so callers decide how to react.
//
// The wrapper makes failures real (-ErrorAction Stop), reports them as plain
// text on stderr, and silences progress output -- when stdout/stderr are pipes
// PowerShell would otherwise serialise progress/error streams as CliXml, which
// is unreadable if it ever reaches the UI.
function runPowerShellScript(script) {
    const wrappedScript = [
        "$ProgressPreference = 'SilentlyContinue'",
        "$ErrorActionPreference = 'Stop'",
        'try {',
        script,
        '} catch {',
        '    [Console]::Error.WriteLine($_.Exception.Message)',
        '    exit 1',
        '}',
    ].join('\n');
    const encodedScript = Buffer.from(wrappedScript, 'utf16le').toString('base64');

    return new Promise((resolve) => {
        execFile(
            'powershell.exe',
            ['-NonInteractive', '-NoProfile', '-WindowStyle', 'Hidden', '-EncodedCommand', encodedScript],
            { windowsHide: true, timeout: POWERSHELL_TIMEOUT_MILLISECONDS, maxBuffer: POWERSHELL_MAXIMUM_OUTPUT_BYTES },
            (error, stdout, stderr) => resolve({ error, stdout: stdout || '', stderr: stderr || '' })
        );
    });
}

module.exports = {
    parsePortNumber,
    parseProcessId,
    escapePowerShellLiteral,
    escapePowerShellWildcard,
    toPowerShellLikePattern,
    validateDisplayName,
    runPowerShellScript,
};
