'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

function dataRoot(env = process.env) {
  return env.CODEX_BEACON_DATA
    || env.PLUGIN_DATA
    || path.join(env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'plugin-data', 'codex-beacon');
}

function identityPath(env = process.env) {
  return path.join(dataRoot(env), 'identity.json');
}

function appendLog(env, message) {
  try {
    const root = dataRoot(env);
    fs.mkdirSync(root, { recursive: true });
    const file = path.join(root, 'beacon.log');
    try {
      const stat = fs.statSync(file);
      if (stat.size > 1024 * 1024) fs.renameSync(file, `${file}.1`);
    } catch {}
    fs.appendFileSync(file, `${new Date().toISOString()} ${String(message).slice(0, 500)}\n`, 'utf8');
  } catch {}
}

async function writeIdentity(identity, env = process.env) {
  const file = identityPath(env);
  const directory = path.dirname(file);
  await fs.promises.mkdir(directory, { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.promises.writeFile(temp, JSON.stringify(identity), { mode: 0o600 });
  await fs.promises.rename(temp, file);
}

function sanitizeIdentity(hook) {
  const event = String(hook.hook_event_name || '');
  if (event !== 'UserPromptSubmit' && event !== 'Stop') return null;
  if (typeof hook.session_id !== 'string' || typeof hook.turn_id !== 'string') return null;
  if (typeof hook.transcript_path !== 'string' || !path.isAbsolute(hook.transcript_path)) return null;

  return {
    protocol: 1,
    event,
    sessionId: hook.session_id,
    turnId: hook.turn_id,
    transcriptPath: hook.transcript_path,
    cwd: typeof hook.cwd === 'string' ? hook.cwd : '',
    timestamp: new Date().toISOString(),
  };
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 1024 * 1024) throw new Error('hook input too large');
  }

  const hook = JSON.parse(input || '{}');
  const identity = sanitizeIdentity(hook);
  if (identity) await writeIdentity(identity);
  process.stdout.write('{}\n');
}

if (require.main === module) {
  main().catch((error) => {
    appendLog(process.env, error?.message || error);
    process.stdout.write('{}\n');
  });
}

module.exports = {
  dataRoot,
  identityPath,
  sanitizeIdentity,
  writeIdentity,
};
