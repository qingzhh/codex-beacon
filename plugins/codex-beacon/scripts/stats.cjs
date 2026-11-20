'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizeLimits } = require('./limits.cjs');

const DEFAULT_CONTEXT_LIMIT = 200000;

function numberOrZero(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function readUsage(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    input: numberOrZero(value.input_tokens),
    cached: numberOrZero(value.cached_input_tokens),
    cacheWrite: numberOrZero(value.cache_write_input_tokens),
    output: numberOrZero(value.output_tokens),
    reasoning: numberOrZero(value.reasoning_output_tokens),
    total: numberOrZero(value.total_tokens),
  };
}

function emptyTurnState(identity = {}) {
  return {
    sessionId: String(identity.sessionId || ''),
    turnId: String(identity.turnId || ''),
    transcriptPath: String(identity.transcriptPath || ''),
    cwd: '',
    workspace: '',
    model: '',
    effort: '',
    status: 'IDLE',
    badge: 'STANDBY',
    detail: '等待 Codex 回合',
    tokens: { input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 0 },
    context: { used: 0, limit: 0, percent: 0 },
    speed: { overall: 0, ttft: 0 },
    quota: null,
    tools: { last: '', count: 0, kinds: 0 },
    compactions: 0,
    startedAt: 0,
    elapsedMs: 0,
    updatedAt: Date.now(),
  };
}

function shortModel(model) {
  const value = String(model || '').trim();
  if (!value) return 'Codex';
  const last = value.split('/').pop();
  return last.length > 28 ? `${last.slice(0, 27)}…` : last;
}

function toolStatus(name) {
  const normalized = String(name || '').toLowerCase();
  if (normalized === 'exec_command' || normalized === 'shell' || normalized === 'bash') {
    return { status: 'RUNNING_CMD', badge: 'EXECUTING', detail: '终端命令执行中' };
  }
  if (normalized === 'apply_patch' || normalized === 'write_file' || normalized === 'edit_file') {
    return { status: 'CODING', badge: 'CODING', detail: '正在修改工作区' };
  }
  if (normalized === 'view_image' || normalized === 'web_search' || normalized === 'read_file') {
    return { status: 'READING', badge: 'READING', detail: '读取资料中' };
  }
  if (normalized === 'spawn_agent' || normalized === 'send_input' || normalized === 'wait'
    || normalized === 'close_agent' || normalized === 'multi_agent_v1') {
    return { status: 'THINKING', badge: 'ORCHESTRATING', detail: '子代理协作中' };
  }
  return { status: 'THINKING', badge: 'WORKING', detail: normalized ? `${name} 调用中` : '处理中' };
}

function sumToolWait(intervals, startMs, endMs) {
  const clipped = [];
  for (const interval of intervals) {
    const start = Math.max(startMs, interval.start);
    const end = Math.min(endMs, interval.end == null ? endMs : interval.end);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      clipped.push([start, end]);
    }
  }
  clipped.sort((a, b) => a[0] - b[0]);

  let total = 0;
  let currentStart = null;
  let currentEnd = null;
  for (const [start, end] of clipped) {
    if (currentEnd === null) {
      currentStart = start;
      currentEnd = end;
    } else if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }
  if (currentEnd !== null) total += currentEnd - currentStart;
  return total;
}

class LiveTracker {
  constructor() {
    this.file = '';
    this.offset = 0;
    this.remainder = '';
    this.fullScanPending = false;
    this.identity = {};
    this.state = emptyTurnState();
    this.toolIntervals = new Map();
    this.pendingCall = null;
    this.toolNames = new Set();
    this.lastUsage = null;
    this.turnUsage = null;
    this.usageEndedAt = 0;
    this.window = DEFAULT_CONTEXT_LIMIT;
    this.firstTextAt = 0;
    this.stopped = false;
    this.lastError = '';
  }

  attach(identity = {}) {
    const nextFile = String(identity.transcriptPath || '');
    const nextTurn = String(identity.turnId || '');
    const fileChanged = nextFile !== this.file;
    const turnChanged = nextTurn !== String(this.identity.turnId || '');

    if (fileChanged) {
      this.file = nextFile;
      this.offset = 0;
      this.remainder = '';
      this.fullScanPending = Boolean(nextFile);
      this.state = emptyTurnState(identity);
    }

    if (turnChanged) {
      const quota = this.state.quota;
      this.state = emptyTurnState(identity);
      this.state.quota = quota;
      this.toolIntervals.clear();
      this.pendingCall = null;
      this.toolNames.clear();
      this.lastUsage = null;
      this.turnUsage = null;
      this.usageEndedAt = 0;
      this.window = DEFAULT_CONTEXT_LIMIT;
      this.firstTextAt = 0;
      this.stopped = false;
      this.lastError = '';
      this.state.startedAt = Date.parse(identity.timestamp || '') || Date.now();
    }

    this.identity = { ...this.identity, ...identity };
    this.state.sessionId = String(this.identity.sessionId || this.state.sessionId || '');
    this.state.turnId = String(this.identity.turnId || this.state.turnId || '');
    this.state.transcriptPath = String(this.identity.transcriptPath || this.state.transcriptPath || '');

    if (identity.event === 'Stop') {
      this.stopped = true;
    } else if (identity.event === 'UserPromptSubmit') {
      this.stopped = false;
    }
  }

  poll(identity = {}, now = Date.now()) {
    this.attach(identity);
    if (!this.file || !fs.existsSync(this.file)) {
      this.finalize(now);
      return this.state;
    }

    if (this.fullScanPending) {
      this.fullScanPending = false;
      try {
        const text = fs.readFileSync(this.file, 'utf8');
        this.offset = Buffer.byteLength(text);
        for (const line of text.split(/\r?\n/)) this.processLine(line);
      } catch {
        // A transient read failure should leave the last known state intact.
      }
    } else {
      this.readDelta();
    }

    this.finalize(now);
    return this.state;
  }

  readDelta() {
    let stat;
    try {
      stat = fs.statSync(this.file);
    } catch {
      return;
    }

    if (stat.size < this.offset) {
      this.offset = 0;
      this.remainder = '';
    }
    if (stat.size === this.offset) return;

    const length = stat.size - this.offset;
    const buffer = Buffer.alloc(length);
    let fd = null;
    try {
      fd = fs.openSync(this.file, 'r');
      const read = fs.readSync(fd, buffer, 0, length, this.offset);
      this.offset += read;
      const chunk = this.remainder + buffer.subarray(0, read).toString('utf8');
      const lines = chunk.split(/\r?\n/);
      this.remainder = lines.pop() || '';
      for (const line of lines) this.processLine(line);
    } catch {
      // Ignore transient locks from the writer.
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch {}
      }
    }
  }

  processLine(line) {
    const raw = String(line || '').trim();
    if (!raw.startsWith('{')) return;

    let row;
    try {
      row = JSON.parse(raw);
    } catch {
      return;
    }

    const payload = row.payload;
    if (!payload || typeof payload !== 'object') return;
    const turnId = String(this.identity.turnId || '');
    const rowTurnId = String(
      payload.turn_id
      || payload.root_turn_id
      || payload.internal_chat_message_metadata_passthrough?.turn_id
      || row.metadata?.turn_id
      || ''
    );

    if (row.type === 'session_meta') {
      if (payload.cwd) {
        this.state.cwd = String(payload.cwd);
        this.state.workspace = path.basename(String(payload.cwd)) || String(payload.cwd);
      }
      return;
    }

    if (row.type === 'event_msg' && payload.type === 'task_started' && payload.turn_id === turnId) {
      this.state.startedAt = Number(payload.started_at) > 0
        ? Number(payload.started_at) * 1000
        : (Date.parse(row.timestamp || '') || Date.now());
      if (Number.isSafeInteger(payload.model_context_window) && payload.model_context_window > 0) {
        this.window = payload.model_context_window;
      }
      return;
    }

    if (row.type === 'turn_context' && payload.turn_id === turnId) {
      if (payload.cwd) {
        this.state.cwd = String(payload.cwd);
        this.state.workspace = path.basename(String(payload.cwd)) || String(payload.cwd);
      }
      if (typeof payload.model === 'string' && payload.model) this.state.model = payload.model;
      if (typeof payload.effort === 'string' && payload.effort) this.state.effort = payload.effort;
      if (!this.state.startedAt) {
        this.state.startedAt = Date.parse(row.timestamp || '') || Date.now();
      }
      return;
    }

    if (row.type === 'token_usage_record' && payload.turn_id === turnId) {
      const turn = readUsage(payload.turn_token_usage);
      if (turn) this.turnUsage = turn;
      const last = readUsage(payload.usage);
      if (last) this.lastUsage = last;
      const timestamp = Date.parse(row.timestamp || '');
      if (Number.isFinite(timestamp)) this.usageEndedAt = timestamp;
      return;
    }

    if (row.type === 'event_msg' && payload.type === 'token_count' && turnId) {
      const timestamp = Date.parse(row.timestamp || '');
      if (this.state.startedAt > 0 && (!Number.isFinite(timestamp) || timestamp < this.state.startedAt)) {
        return;
      }
      const info = payload.info || {};
      const last = readUsage(info.last_token_usage);
      if (last) this.lastUsage = last;
      if (Number.isSafeInteger(info.model_context_window) && info.model_context_window > 0) {
        this.window = info.model_context_window;
      }
      if (payload.rate_limits) {
        const quota = normalizeLimits(payload.rate_limits, timestamp || Date.now(), 'log');
        if (quota) this.state.quota = quota;
      }
      return;
    }

    if (row.type === 'compacted'
      || (row.type === 'event_msg' && payload.type === 'context_compacted')) {
      if (!rowTurnId || rowTurnId === turnId) this.state.compactions += 1;
      return;
    }

    if (row.type === 'event_msg' && payload.type === 'item_completed') {
      const item = payload.item || {};
      if (String(item.type).toLowerCase() === 'agentmessage'
        && Number.isSafeInteger(payload.started_at_ms) && payload.started_at_ms > 0) {
        this.firstTextAt = this.firstTextAt === 0
          ? payload.started_at_ms
          : Math.min(this.firstTextAt, payload.started_at_ms);
      }
      if (String(item.type).toLowerCase() === 'commandexecution') {
        if (item.status === 'failed' || (Number.isInteger(item.exit_code) && item.exit_code !== 0)) {
          this.lastError = 'terminal';
        } else if (item.status === 'completed' || item.exit_code === 0) {
          this.lastError = '';
        }
      }
      return;
    }

    if (row.type === 'response_item' && (payload.type === 'function_call' || payload.type === 'custom_tool_call')) {
      if (!rowTurnId || rowTurnId === turnId) {
        const name = typeof payload.name === 'string' ? payload.name : 'tool';
        const callId = String(payload.call_id || payload.id || `${name}:${row.timestamp || ''}`);
        const timestamp = Date.parse(row.timestamp || '');
        if (Number.isFinite(timestamp)) {
          this.toolIntervals.set(callId, { start: timestamp, end: null });
        }
        this.pendingCall = { id: callId, name };
        this.toolNames.add(name);
        this.state.tools.last = name;
        this.state.tools.count += 1;
        this.state.detail = toolStatus(name).detail;
      }
      return;
    }

    if (row.type === 'response_item'
      && (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output')) {
      const callId = String(payload.call_id || payload.id || '');
      const interval = this.toolIntervals.get(callId);
      const timestamp = Date.parse(row.timestamp || '');
      if (interval && interval.end === null && Number.isFinite(timestamp)) {
        interval.end = timestamp;
      }
      if (this.pendingCall && this.pendingCall.id === callId) {
        this.pendingCall = null;
      }
    }
  }

  finalize(now) {
    const turn = this.turnUsage || {
      input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 0,
    };
    this.state.tokens = { ...turn };
    this.state.tools.kinds = this.toolNames.size;

    const contextUsed = this.lastUsage?.input || (turn.input + turn.cached);
    const contextLimit = this.window > 0 ? this.window : DEFAULT_CONTEXT_LIMIT;
    this.state.context = {
      used: contextUsed,
      limit: contextLimit,
      percent: contextLimit > 0 ? Math.min(100, Number((contextUsed / contextLimit * 100).toFixed(1))) : 0,
    };

    const start = this.state.startedAt || 0;
    const end = this.usageEndedAt || now;
    let rate = 0;
    if (start > 0 && end > start && turn.output > 0) {
      const wait = sumToolWait(Array.from(this.toolIntervals.values()), start, end);
      const duration = end - start - wait;
      if (duration > 200) rate = turn.output / (duration / 1000);
    }
    this.state.speed.overall = Number.isFinite(rate) ? Number(rate.toFixed(1)) : 0;
    this.state.speed.ttft = this.firstTextAt > start && start > 0
      ? Number(((this.firstTextAt - start) / 1000).toFixed(2))
      : 0;

    if (this.stopped) {
      this.state.status = 'AWAITING_NEXT';
      this.state.badge = 'READY';
      this.state.detail = '本轮完成 · 等待下一步';
    } else if (this.lastError) {
      this.state.status = 'ERROR';
      this.state.badge = 'ALERT';
      this.state.detail = '最近一次终端执行失败';
    } else if (this.pendingCall) {
      const presentation = toolStatus(this.pendingCall.name);
      this.state.status = presentation.status;
      this.state.badge = presentation.badge;
      this.state.detail = `${presentation.detail} · ${this.pendingCall.name}`;
    } else if (start > 0) {
      this.state.status = 'THINKING';
      this.state.badge = 'THINKING';
      this.state.detail = 'Codex 正在处理当前回合';
    } else {
      this.state.status = 'IDLE';
      this.state.badge = 'STANDBY';
      this.state.detail = '等待 Codex 回合';
    }

    this.state.model = shortModel(this.state.model);
    this.state.elapsedMs = start > 0 ? Math.max(0, now - start) : 0;
    this.state.updatedAt = now;
  }
}

module.exports = {
  DEFAULT_CONTEXT_LIMIT,
  LiveTracker,
  emptyTurnState,
  readUsage,
  sumToolWait,
  toolStatus,
};
