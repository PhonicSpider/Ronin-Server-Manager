'use strict';

// Windows Firewall operations shared by the desktop UI (IPC), the local REST API
// and the Citadel portal relay. Previously each caller carried its own copy of
// this logic with unvalidated ports, quote-only escaping and the ability to
// remove or disable ANY firewall rule on the machine by name. All of it now
// lives here, validates its inputs, and is scoped to RSM's own rule group.

const {
    parsePortNumber,
    escapePowerShellLiteral,
    toPowerShellLikePattern,
    validateDisplayName,
    runPowerShellScript,
} = require('./powershell-safety');

const RULE_GROUP = 'Ronin Portier Rules';

// Per-server rules are named "RSM - <server> - <port label> - <TCP|UDP>".
function serverRulePrefix(serverName) {
    return `RSM - ${serverName} - `;
}

function failure(message) {
    return { success: false, error: message };
}

function outcomeOf(scriptResult) {
    if (scriptResult.error) {
        return failure(scriptResult.stderr.trim() || scriptResult.error.message);
    }
    return { success: true, error: null };
}

// Script fragment that selects only rules in RSM's own group whose display name
// matches exactly. Scoping to the group is what stops a remove/toggle request
// (REST API, portal) from touching unrelated rules such as "Core Networking".
function selectManagedRuleByExactName(displayName) {
    return `Get-NetFirewallRule -Group '${RULE_GROUP}' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq '${escapePowerShellLiteral(displayName)}' }`;
}

function selectServerRules(serverName) {
    const pattern = toPowerShellLikePattern(`${serverRulePrefix(serverName)}`) + '*';
    return `Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '${pattern}' }`;
}

// True when at least one rule exists for the server.
async function serverHasRules(serverName) {
    try {
        validateDisplayName(serverName, 'Server name');
    } catch {
        return false;
    }
    const scriptResult = await runPowerShellScript(
        `$rules = @(${selectServerRules(serverName)})\nif ($rules.Count -gt 0) { Write-Output 'ACTIVE' } else { Write-Output 'NONE' }`
    );
    return !scriptResult.error && scriptResult.stdout.trim() === 'ACTIVE';
}

// Replaces every rule for the server with one rule per enabled protocol/port.
async function applyServerRules(serverName, portDefinitions) {
    try {
        validateDisplayName(serverName, 'Server name');
    } catch (validationError) {
        return failure(validationError.message);
    }

    const creationLines = [];
    for (const portDefinition of (Array.isArray(portDefinitions) ? portDefinitions : [])) {
        const portNumber = parsePortNumber(portDefinition && portDefinition.port);
        if (portNumber === null) {
            return failure(`Invalid port: ${JSON.stringify(portDefinition && portDefinition.port)}. Ports must be whole numbers from 1 to 65535.`);
        }
        const portLabel = String(portDefinition.label || portDefinition.id || `Port ${portNumber}`);
        try {
            validateDisplayName(portLabel, 'Port label');
        } catch (validationError) {
            return failure(validationError.message);
        }
        for (const [isEnabled, protocolName] of [[portDefinition.tcp, 'TCP'], [portDefinition.udp, 'UDP']]) {
            if (!isEnabled) continue;
            const ruleName = `${serverRulePrefix(serverName)}${portLabel} - ${protocolName}`;
            creationLines.push(
                `New-NetFirewallRule -DisplayName '${escapePowerShellLiteral(ruleName)}' -Direction Inbound -Protocol ${protocolName} -LocalPort ${portNumber} -Action Allow -Group '${RULE_GROUP}' | Out-Null`
            );
        }
    }
    if (creationLines.length === 0) return failure('No ports defined.');

    return outcomeOf(await runPowerShellScript(
        `${selectServerRules(serverName)} | Remove-NetFirewallRule -ErrorAction SilentlyContinue\n${creationLines.join('\n')}`
    ));
}

async function removeServerRules(serverName) {
    try {
        validateDisplayName(serverName, 'Server name');
    } catch (validationError) {
        return failure(validationError.message);
    }
    return outcomeOf(await runPowerShellScript(`${selectServerRules(serverName)} | Remove-NetFirewallRule -ErrorAction SilentlyContinue`));
}

// Every rule in RSM's group: [{ name, protocol, port, enabled }]
async function listManagedRules() {
    const scriptResult = await runPowerShellScript(`
$rules = @(Get-NetFirewallRule -Group '${RULE_GROUP}' -ErrorAction SilentlyContinue)
if ($rules.Count -eq 0) { Write-Output '[]'; exit }
$output = $rules | ForEach-Object {
    $rule = $_
    $portFilter = $rule | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
    [PSCustomObject]@{
        name     = $rule.DisplayName
        protocol = if ($portFilter) { [string]$portFilter.Protocol } else { '' }
        port     = if ($portFilter) { [string]$portFilter.LocalPort } else { '' }
        enabled  = [string]$rule.Enabled
    }
}
ConvertTo-Json -InputObject @($output) -Compress`.trim());

    if (scriptResult.error || !scriptResult.stdout.trim()) return [];
    try {
        const parsedRules = JSON.parse(scriptResult.stdout.trim());
        return Array.isArray(parsedRules) ? parsedRules : [parsedRules];
    } catch {
        return [];
    }
}

// Adds one inbound allow rule per selected protocol, tagged with RSM's group so
// remove/toggle can later be restricted to rules RSM created.
async function addRule({ displayName, port, tcp, udp }) {
    try {
        validateDisplayName(displayName, 'Rule name');
    } catch (validationError) {
        return failure(validationError.message);
    }
    const portNumber = parsePortNumber(port);
    if (portNumber === null) return failure('Port must be a whole number from 1 to 65535.');
    if (!tcp && !udp) return failure('Select at least one protocol.');

    const creationLines = [];
    for (const [isEnabled, protocolName] of [[tcp, 'TCP'], [udp, 'UDP']]) {
        if (!isEnabled) continue;
        creationLines.push(
            `New-NetFirewallRule -DisplayName '${escapePowerShellLiteral(displayName)}' -Direction Inbound -Protocol ${protocolName} -LocalPort ${portNumber} -Action Allow -Group '${RULE_GROUP}' | Out-Null`
        );
    }
    return outcomeOf(await runPowerShellScript(creationLines.join('\n')));
}

// Removes a rule by exact name -- but only if it is one of RSM's own.
async function removeRule(displayName) {
    try {
        validateDisplayName(displayName, 'Rule name');
    } catch (validationError) {
        return failure(validationError.message);
    }
    return outcomeOf(await runPowerShellScript(
        `$managedRules = @(${selectManagedRuleByExactName(displayName)})\n` +
        `if ($managedRules.Count -eq 0) { throw 'No RSM-managed firewall rule with that name was found.' }\n` +
        `$managedRules | Remove-NetFirewallRule`
    ));
}

// Enables or disables a rule by exact name -- again limited to RSM's own rules.
async function setRuleEnabled(displayName, isEnabled) {
    try {
        validateDisplayName(displayName, 'Rule name');
    } catch (validationError) {
        return failure(validationError.message);
    }
    const enabledState = isEnabled ? 'True' : 'False';
    return outcomeOf(await runPowerShellScript(
        `$managedRules = @(${selectManagedRuleByExactName(displayName)})\n` +
        `if ($managedRules.Count -eq 0) { throw 'No RSM-managed firewall rule with that name was found.' }\n` +
        `$managedRules | Set-NetFirewallRule -Enabled ${enabledState}`
    ));
}

// Finds enabled inbound rules already using any of the given ports. Rules that
// belong to excludedServerName are ignored so re-applying a server's own rules
// is not reported as a conflict with itself.
async function findPortConflicts(rawPorts, excludedServerName) {
    const portNumbers = [];
    for (const rawPort of (Array.isArray(rawPorts) ? rawPorts : [])) {
        const portNumber = parsePortNumber(rawPort);
        if (portNumber !== null) portNumbers.push(portNumber);
    }
    if (portNumbers.length === 0) return [];

    const exclusionFilter = excludedServerName
        ? ` -and $rule.DisplayName -notlike '${toPowerShellLikePattern(serverRulePrefix(excludedServerName))}*'`
        : '';
    // Query port filters first (one CIM call), then look up the owning rule only
    // for matching ports -- O(matches) lookups instead of O(all rules).
    const scriptResult = await runPowerShellScript(`$portsToCheck = @(${portNumbers.map(portNumber => `'${portNumber}'`).join(', ')})
$conflicts = @()
Get-NetFirewallPortFilter -ErrorAction SilentlyContinue | ForEach-Object {
    $portFilter = $_
    $localPorts = @($portFilter.LocalPort) | Where-Object { $_ -match '^[0-9]+$' }
    $matchedPorts = $localPorts | Where-Object { $portsToCheck -contains $_ }
    if ($matchedPorts) {
        $rule = $portFilter | Get-NetFirewallRule -ErrorAction SilentlyContinue
        if ($rule -and $rule.Enabled -eq 'True' -and $rule.Direction -eq 'Inbound'${exclusionFilter}) {
            foreach ($matchedPort in $matchedPorts) { $conflicts += [PSCustomObject]@{ port = $matchedPort; protocol = [string]$portFilter.Protocol; ruleName = $rule.DisplayName } }
        }
    }
}
ConvertTo-Json -InputObject @($conflicts) -Compress`);

    if (scriptResult.error || !scriptResult.stdout.trim()) return [];
    try {
        const parsedConflicts = JSON.parse(scriptResult.stdout.trim());
        return Array.isArray(parsedConflicts) ? parsedConflicts : [parsedConflicts];
    } catch {
        return [];
    }
}

module.exports = {
    RULE_GROUP,
    serverHasRules,
    applyServerRules,
    removeServerRules,
    listManagedRules,
    addRule,
    removeRule,
    setRuleEnabled,
    findPortConflicts,
};
