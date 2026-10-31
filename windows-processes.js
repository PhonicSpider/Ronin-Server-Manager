'use strict';

// Process discovery and resource sampling for Windows, built on PowerShell +
// Get-CimInstance (WMI/CIM) instead of the wmic.exe command-line tool.
//
// Microsoft is removing WMIC from Windows 11 24H2/25H2 (it is no longer
// installable as a Feature on Demand), so every `wmic ...` call RSM used to make
// -- finding a server's real PID after launch, re-linking servers at startup,
// reading CPU time -- silently returns nothing on updated machines and servers
// never reach "Online". The WMI data is unchanged; only the CLI is going away.

const {
    runPowerShellScript,
    escapePowerShellLiteral,
    parseProcessId,
} = require('./powershell-safety');

const DEFAULT_SAMPLE_INTERVAL_MILLISECONDS = 2000;
const HUNDRED_NANOSECONDS_PER_MILLISECOND = 10000;

// WQL string literals escape backslash and single quote with a backslash.
function escapeWqlLiteral(text) {
    return String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Embeds a WQL filter inside a PowerShell single-quoted string.
function wqlFilterArgument(filterText) {
    return `'${escapePowerShellLiteral(filterText)}'`;
}

// Runs a script that prints a JSON array; returns the parsed array, or null if
// the query itself failed (so callers can tell "no results" from "could not ask").
async function runJsonArrayQuery(script) {
    const scriptResult = await runPowerShellScript(script);
    if (scriptResult.error) return null;
    const outputText = scriptResult.stdout.trim();
    if (outputText === '') return [];
    try {
        const parsedOutput = JSON.parse(outputText);
        return Array.isArray(parsedOutput) ? parsedOutput : [parsedOutput];
    } catch {
        return null;
    }
}

const PROCESS_PROJECTION = `ForEach-Object { [PSCustomObject]@{ processId = [int]$_.ProcessId; parentProcessId = [int]$_.ParentProcessId; name = [string]$_.Name; commandLine = [string]$_.CommandLine } }`;

// Every running process with this image name (e.g. "RustDedicated.exe").
// Resolves [{ processId, parentProcessId, commandLine }] or null on query failure.
function listProcessesByImageName(imageName) {
    const filter = wqlFilterArgument(`Name='${escapeWqlLiteral(imageName)}'`);
    return runJsonArrayQuery(
        `$found = @(Get-CimInstance -ClassName Win32_Process -Filter ${filter} -ErrorAction SilentlyContinue | ${PROCESS_PROJECTION})\nConvertTo-Json -InputObject $found -Compress`
    );
}

// Direct children of a process (used to find the real game under the PowerShell bridge).
function listChildProcesses(parentProcessId) {
    const validatedId = parseProcessId(parentProcessId);
    if (validatedId === null) return Promise.resolve([]);
    return runJsonArrayQuery(
        `$found = @(Get-CimInstance -ClassName Win32_Process -Filter 'ParentProcessId=${validatedId}' -ErrorAction SilentlyContinue | ${PROCESS_PROJECTION})\nConvertTo-Json -InputObject $found -Compress`
    );
}

// Running Windows services: [{ serviceName, pathName, processId }].
function listRunningServices() {
    return runJsonArrayQuery(
        `$found = @(Get-CimInstance -ClassName Win32_Service -Filter 'State=''Running''' -ErrorAction SilentlyContinue | ForEach-Object { [PSCustomObject]@{ serviceName = [string]$_.Name; pathName = [string]$_.PathName; processId = [int]$_.ProcessId } })\nConvertTo-Json -InputObject $found -Compress`
    );
}

// Memory + cumulative CPU time for a set of processes in ONE query.
// Resolves [{ processId, workingSetBytes, cpuTime100ns }] for processes that
// exist (missing ids are simply absent), or null when the query itself failed.
function sampleProcesses(processIds) {
    const validatedIds = [...new Set(processIds.map(parseProcessId).filter(processId => processId !== null))];
    if (validatedIds.length === 0) return Promise.resolve([]);
    const filter = validatedIds.map(processId => `ProcessId=${processId}`).join(' OR ');
    return runJsonArrayQuery(
        `$found = @(Get-CimInstance -ClassName Win32_Process -Filter '${filter}' -Property ProcessId,WorkingSetSize,KernelModeTime,UserModeTime -ErrorAction SilentlyContinue | ForEach-Object { [PSCustomObject]@{ processId = [int]$_.ProcessId; workingSetBytes = [double]$_.WorkingSetSize; cpuTime100ns = [double]($_.KernelModeTime + $_.UserModeTime) } })\nConvertTo-Json -InputObject $found -Compress`
    );
}

// One shared timer for every monitored server. watch() registers a pid and
// calls back on each tick with:
//   { workingSetBytes, cpuPercent }  -- process is alive (cpuPercent is null on the first tick)
//   null                             -- the query SUCCEEDED and the process is gone
// A failed query is skipped entirely: it must never be mistaken for a dead server.
function createProcessSampler({ intervalMilliseconds = DEFAULT_SAMPLE_INTERVAL_MILLISECONDS, logicalCoreCount }) {
    const watchers = new Map(); // processId -> { callbacks:Set, previousCpuTime, previousSampleAt }
    let timerHandle = null;
    let isSampling = false;

    async function sampleAll() {
        if (isSampling || watchers.size === 0) return;
        isSampling = true;
        try {
            const samples = await sampleProcesses([...watchers.keys()]);
            if (samples === null) return;
            const sampledAt = Date.now();
            const samplesByProcessId = new Map(samples.map(sample => [sample.processId, sample]));

            for (const [processId, watcher] of [...watchers]) {
                const sample = samplesByProcessId.get(processId);
                let result = null;
                if (sample) {
                    let cpuPercent = null;
                    if (watcher.previousSampleAt !== null) {
                        const elapsed100ns = (sampledAt - watcher.previousSampleAt) * HUNDRED_NANOSECONDS_PER_MILLISECOND;
                        const cpuDelta100ns = sample.cpuTime100ns - watcher.previousCpuTime;
                        cpuPercent = elapsed100ns > 0
                            ? Math.max(0, Math.min(100, Math.round((cpuDelta100ns / elapsed100ns / logicalCoreCount) * 100)))
                            : 0;
                    }
                    watcher.previousCpuTime = sample.cpuTime100ns;
                    watcher.previousSampleAt = sampledAt;
                    result = { workingSetBytes: sample.workingSetBytes, cpuPercent };
                }
                for (const callback of [...watcher.callbacks]) {
                    try { callback(result); } catch (callbackError) { console.error('[RSM] process sampler callback failed:', callbackError.message); }
                }
            }
        } finally {
            isSampling = false;
        }
    }

    function ensureTimer() {
        if (timerHandle === null) timerHandle = setInterval(sampleAll, intervalMilliseconds);
    }

    function stopTimerIfIdle() {
        if (watchers.size === 0 && timerHandle !== null) {
            clearInterval(timerHandle);
            timerHandle = null;
        }
    }

    // Returns a function that stops watching.
    function watch(processId, callback) {
        const validatedId = parseProcessId(processId);
        if (validatedId === null) return () => {};
        if (!watchers.has(validatedId)) {
            watchers.set(validatedId, { callbacks: new Set(), previousCpuTime: 0, previousSampleAt: null });
        }
        const watcher = watchers.get(validatedId);
        watcher.callbacks.add(callback);
        ensureTimer();

        return function stopWatching() {
            watcher.callbacks.delete(callback);
            if (watcher.callbacks.size === 0) watchers.delete(validatedId);
            stopTimerIfIdle();
        };
    }

    return { watch };
}

module.exports = {
    listProcessesByImageName,
    listChildProcesses,
    listRunningServices,
    sampleProcesses,
    createProcessSampler,
};
