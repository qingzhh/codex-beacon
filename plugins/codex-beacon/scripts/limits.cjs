'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn, execFileSync } = require('node:child_process');

function normalizeLimits(value, sampledAt, source = 'log') {
  if (!value || typeof value !== 'object' || !Number.isFinite(sampledAt)) return null;

  let bucket;
  const byId = value.rateLimitsByLimitId || value.rate_limits_by_limit_id;
  if (byId && typeof byId === 'object') {
    bucket = byId.codex;
  } else {
    bucket = value.rateLimits || value.rate_limits || value;
  }
  if (!bucket || typeof bucket !== 'object') return null;

  const limitId = bucket.limitId ?? bucket.limit_id;
  if (limitId != null && limitId !== 'codex') return null;

  const result = {
    source,
    sampledAt,
    fiveHour: null,
    weekly: null,
  };

  for (const window of [bucket.primary, bucket.secondary]) {
    if (!window || typeof window !== 'object') continue;
    const usedPercent = window.usedPercent ?? window.used_percent;
    const windowMinutes = window.windowDurationMins ?? window.window_minutes;
    const resetsAt = window.resetsAt ?? window.resets_at;
    if (!Number.isFinite(usedPercent) || usedPercent < 0) continue;

    const key = windowMinutes === 300 ? 'fiveHour' : windowMinutes === 10080 ? 'weekly' : null;
    if (!key) continue;
    result[key] = {
      usedPercent: Math.max(0, Math.min(100, usedPercent)),
      resetsAt: Number.isSafeInteger(resetsAt) && resetsAt > 0 ? resetsAt : null,
    };
  }

  return result.fiveHour || result.weekly ? result : null;
}

function resolveFromNpmShim(shimPath) {
  if (!shimPath) return '';
  const root = path.dirname(shimPath);
  const candidates = [
    path.join(root, 'node_modules', '@openai', 'codex', 'node_modules', '@openai',
      'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'),
    path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex.exe'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function newestCodexUnder(baseDir) {
  if (!baseDir || !fs.existsSync(baseDir)) return '';
  let best = '';
  let bestTime = -1;
  try {
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(baseDir, entry.name, 'codex.exe');
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile() && stat.mtimeMs > bestTime) {
          best = candidate;
          bestTime = stat.mtimeMs;
        }
      } catch {
        // Ignore partial or stale runtime directories.
      }
    }
  } catch {
    return '';
  }
  return best;
}

function findCodexExecutable(env = process.env) {
  const explicit = [env.CODEX_CLI_PATH, env.CODEX_EXE, env.CODEX_BEACON_CODEX_EXE];
  for (const candidate of explicit) {
    if (candidate && path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
  }

  const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const candidates = [
    newestCodexUnder(path.join(localAppData, 'OpenAI', 'Codex', 'bin')),
    resolveFromNpmShim(path.join(appData, 'npm', 'codex.ps1')),
    resolveFromNpmShim(path.join(appData, 'npm', 'codex.cmd')),
  ].filter(Boolean);
  if (candidates.length > 0) return candidates[0];

  try {
    const output = execFileSync('where.exe', ['codex'], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of output.split(/\r?\n/)) {
      const candidate = line.trim();
      if (!candidate) continue;
      if (/\.exe$/i.test(candidate) && fs.existsSync(candidate)) return candidate;
      const resolved = resolveFromNpmShim(candidate);
      if (resolved) return resolved;
    }
  } catch {
    // PATH lookup is optional.
  }

  return '';
}

function readAccountLimits(env = process.env, timeoutMs = 3500) {
  const exe = findCodexExecutable(env);
  if (!exe) return Promise.resolve(null);

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, ['app-server', '--strict-config'], {
        env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      resolve(null);
      return;
    }

    let done = false;
    let bytes = 0;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { lines.close(); } catch {}
      try { child.stdin.end(); } catch {}
      try { child.kill(); } catch {}
      resolve(value);
    };
    const send = (value) => {
      if (!done) {
        try { child.stdin.write(JSON.stringify(value) + '\n'); } catch {}
      }
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    const lines = readline.createInterface({ input: child.stdout });
    child.stderr.resume();
    child.on('error', () => finish(null));
    child.on('exit', () => finish(null));
    child.stdin.on('error', () => finish(null));

    lines.on('line', (line) => {
      bytes += Buffer.byteLength(line);
      if (bytes > 1024 * 1024) {
        finish(null);
        return;
      }
      let row;
      try { row = JSON.parse(line); } catch { return; }

      if (row.id === 1) {
        if (row.error) {
          finish(null);
          return;
        }
        send({ method: 'initialized' });
        send({
          id: 2,
          method: 'account/rateLimits/read',
          params: { supportsLunaReserve: false, excludeResetCreditDetails: true },
        });
      } else if (row.id === 2) {
        finish(row.error ? null : normalizeLimits(row.result, Date.now(), 'live'));
      }
    });

    send({
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'codex_beacon', version: '0.1.0' },
        capabilities: { experimentalApi: true },
      },
    });
  });
}

module.exports = {
  findCodexExecutable,
  normalizeLimits,
  readAccountLimits,
};
