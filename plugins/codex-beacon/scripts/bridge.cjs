'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { dataRoot, identityPath } = require('./hook.cjs');
const { LiveTracker } = require('./stats.cjs');
const { readAccountLimits } = require('./limits.cjs');

const dataRootArg = process.argv.indexOf('--data-root');
if (dataRootArg >= 0 && process.argv[dataRootArg + 1]) {
  process.env.CODEX_BEACON_DATA = process.argv[dataRootArg + 1];
}
if (process.argv.includes('--no-live-limits')) {
  process.env.CODEX_BEACON_DISABLE_LIVE_LIMITS = '1';
}

const PORT = Number(process.env.CODEX_BEACON_PORT || 17891);
const ROOT = dataRoot(process.env);
const IDENTITY_FILE = identityPath(process.env);
const LOG_FILE = path.join(ROOT, 'bridge.log');

fs.mkdirSync(ROOT, { recursive: true });

function log(message) {
  try {
    try {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > 1024 * 1024) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    } catch {}
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${String(message).slice(0, 800)}\n`, 'utf8');
  } catch {}
}

function readIdentity() {
  try {
    return JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req, limit = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const tracker = new LiveTracker();
let liveQuota = null;
let quotaPending = false;
let lastQuotaAt = 0;
let notice = null;
let shuttingDown = false;
let lastIdentityRaw = '';

function refreshQuota() {
  if (process.env.CODEX_BEACON_DISABLE_LIVE_LIMITS === '1') return;
  if (quotaPending) return;
  quotaPending = true;
  readAccountLimits(process.env, 3000)
    .then((value) => {
      if (value) {
        liveQuota = value;
        lastQuotaAt = Date.now();
      }
    })
    .catch(() => {})
    .finally(() => {
      quotaPending = false;
    });
}

function currentState(now = Date.now()) {
  let identity = {};
  try {
    const raw = fs.readFileSync(IDENTITY_FILE, 'utf8');
    if (raw !== lastIdentityRaw) {
      lastIdentityRaw = raw;
      identity = JSON.parse(raw);
      tracker.attach(identity);
    } else {
      identity = JSON.parse(raw);
    }
  } catch {
    identity = {};
  }

  const state = tracker.poll(identity, now);
  if (liveQuota && (!state.quota || liveQuota.sampledAt >= (state.quota.sampledAt || 0))) {
    state.quota = liveQuota;
  }
  if (notice && now - notice.at < 9000) {
    state.notice = notice;
  } else {
    state.notice = null;
  }

  return {
    ok: true,
    port: PORT,
    active: Boolean(identity.transcriptPath),
    event: identity.event || '',
    ...state,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      const state = currentState();
      sendJson(res, 200, {
        ok: true,
        pid: process.pid,
        port: PORT,
        active: state.active,
        sessionId: state.sessionId,
        turnId: state.turnId,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      sendJson(res, 200, currentState());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/notify') {
      const body = await readBody(req);
      const message = String(body.message || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      if (!message) {
        sendJson(res, 400, { ok: false, error: 'message required' });
        return;
      }
      notice = {
        message,
        kind: String(body.kind || 'signal').slice(0, 24),
        at: Date.now(),
      };
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/quit') {
      sendJson(res, 200, { ok: true });
      if (!shuttingDown) {
        shuttingDown = true;
        setTimeout(() => process.exit(0), 80);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/command') {
      const body = await readBody(req);
      if (body.command === 'shutdown') {
        sendJson(res, 200, { ok: true });
        if (!shuttingDown) {
          shuttingDown = true;
          setTimeout(() => process.exit(0), 80);
        }
      } else {
        sendJson(res, 200, { ok: true, ignored: true });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (error) {
    log(error?.stack || error?.message || error);
    if (!res.writableEnded) sendJson(res, 500, { ok: false, error: 'internal error' });
  }
});

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (error) => log(error?.stack || error));
process.on('unhandledRejection', (error) => log(error?.stack || error));

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    log(`port ${PORT} already in use`);
    process.exit(0);
  }
  log(error?.stack || error);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  refreshQuota();
  const quotaTimer = setInterval(() => {
    if (Date.now() - lastQuotaAt > 30000) refreshQuota();
  }, 5000);
  quotaTimer.unref();
  log(`listening on 127.0.0.1:${PORT}`);
});
