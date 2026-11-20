'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.CODEX_BEACON_PORT || 17891);
const BRIDGE = path.join(__dirname, 'bridge.cjs');
const UI = path.join(PLUGIN_ROOT, 'ui', 'beacon.ps1');
const DATA_ROOT = process.env.CODEX_BEACON_DATA
  || process.env.PLUGIN_DATA
  || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'plugin-data', 'codex-beacon');

function health() {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${PORT}/health`, (response) => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const value = JSON.parse(data);
          resolve(Boolean(value?.ok));
        } catch {
          resolve(false);
        }
      });
    });
    request.setTimeout(700, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

function post(pathname, body = {}) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const request = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode >= 200 && response.statusCode < 300));
    });
    request.setTimeout(1200, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
    request.write(payload);
    request.end();
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function windowsPowerShell() {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function quoteWindowsArgument(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function spawnOutsideJob(executable, args, cwd) {
  if (process.platform !== 'win32') {
    const child = spawn(executable, args, {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: process.env,
    });
    child.unref();
    return child.pid || 0;
  }

  const commandLine = [executable, ...args].map(quoteWindowsArgument).join(' ');
  const escapeSingle = (value) => String(value).replace(/'/g, "''");
  const script = [
    '$startup = New-CimInstance -ClassName Win32_ProcessStartup -Property @{ ShowWindow = [uint16]0 } -ClientOnly',
    `$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '${escapeSingle(commandLine)}'; CurrentDirectory = '${escapeSingle(cwd)}'; ProcessStartupInformation = $startup }`,
    'if ($result.ReturnValue -ne 0) { throw "Win32_Process.Create failed: $($result.ReturnValue)" }',
    'Write-Output $result.ProcessId',
  ].join('; ');

  try {
    const output = execFileSync(windowsPowerShell(), [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return Number(output.trim()) || 0;
  } catch {
    const child = spawn(executable, args, {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: process.env,
    });
    child.unref();
    return child.pid || 0;
  }
}

async function ensureBridge() {
  if (await health()) return { started: false };

  const bridgeArgs = [BRIDGE, '--data-root', DATA_ROOT];
  if (process.env.CODEX_BEACON_DISABLE_LIVE_LIMITS === '1') {
    bridgeArgs.push('--no-live-limits');
  }
  spawnOutsideJob(process.execPath, bridgeArgs, PLUGIN_ROOT);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    await wait(250);
    if (await health()) return { started: true };
  }
  throw new Error('Codex Beacon bridge did not become healthy');
}

function startUi() {
  const executable = windowsPowerShell();
  if (!fs.existsSync(executable)) throw new Error(`PowerShell not found at ${executable}`);
  if (!fs.existsSync(UI)) throw new Error(`UI script not found at ${UI}`);

  spawnOutsideJob(executable, [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-WindowStyle',
    'Hidden',
    '-File',
    UI,
    '-Port',
    String(PORT),
  ], PLUGIN_ROOT);
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('Codex Beacon 0.1 currently supports Windows 10/11 only');
  }

  if (process.argv.includes('--stop')) {
    const stopped = await post('/api/quit');
    process.stdout.write(JSON.stringify({ ok: stopped, stopped: true, port: PORT }) + '\n');
    return;
  }

  const bridge = await ensureBridge();
  startUi();
  await wait(650);

  process.stdout.write(JSON.stringify({
    ok: true,
    launched: true,
    bridgeStarted: bridge.started,
    port: PORT,
    ui: UI,
  }) + '\n');
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({ ok: false, error: error?.message || String(error) }) + '\n');
  process.exitCode = 1;
});
