'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LiveTracker, sumToolWait, toolStatus } = require('../scripts/stats.cjs');

function jsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
}

test('LiveTracker derives turn usage, context, throughput, and completion state', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-beacon-'));
  const transcript = path.join(directory, 'rollout.jsonl');
  const turnId = 'turn-test';
  const sessionId = 'session-test';
  const rows = [
    {
      timestamp: '1970-01-01T00:16:39.000Z',
      type: 'session_meta',
      payload: { id: sessionId, cwd: 'C:\\work\\demo' },
    },
    {
      timestamp: '1970-01-01T00:16:40.000Z',
      type: 'event_msg',
      payload: { type: 'task_started', turn_id: turnId, started_at: 1000, model_context_window: 200000 },
    },
    {
      timestamp: '1970-01-01T00:16:40.100Z',
      type: 'turn_context',
      payload: { turn_id: turnId, model: 'gpt-test', effort: 'medium', cwd: 'C:\\work\\demo' },
    },
    {
      timestamp: '1970-01-01T00:16:41.000Z',
      type: 'response_item',
      metadata: { turn_id: turnId },
      payload: { type: 'function_call', name: 'exec_command', call_id: 'call-1' },
    },
    {
      timestamp: '1970-01-01T00:16:42.000Z',
      type: 'response_item',
      metadata: { turn_id: turnId },
      payload: { type: 'function_call_output', call_id: 'call-1', output: 'ok' },
    },
    {
      timestamp: '1970-01-01T00:16:44.000Z',
      type: 'event_msg',
      payload: {
        type: 'item_completed',
        turn_id: turnId,
        item: { type: 'AgentMessage' },
        started_at_ms: 1002000,
        completed_at_ms: 1004000,
      },
    },
    {
      timestamp: '1970-01-01T00:16:45.000Z',
      type: 'token_usage_record',
      payload: {
        turn_id: turnId,
        turn_token_usage: {
          input_tokens: 12000,
          cached_input_tokens: 2000,
          cache_write_input_tokens: 0,
          output_tokens: 100,
          reasoning_output_tokens: 20,
          total_tokens: 12100,
        },
        usage: { input_tokens: 12000, cached_input_tokens: 2000, output_tokens: 100, total_tokens: 12100 },
      },
    },
    {
      timestamp: '1970-01-01T00:16:45.100Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: { input_tokens: 12000, cached_input_tokens: 2000, output_tokens: 100, total_tokens: 12100 },
          model_context_window: 200000,
        },
        rate_limits: {
          rateLimits: {
            limitId: 'codex',
            primary: { usedPercent: 12.5, windowDurationMins: 300, resetsAt: 2000 },
            secondary: { usedPercent: 4.0, windowDurationMins: 10080, resetsAt: 3000 },
          },
        },
      },
    },
  ];
  fs.writeFileSync(transcript, jsonl(rows), 'utf8');

  const tracker = new LiveTracker();
  tracker.attach({
    event: 'UserPromptSubmit',
    sessionId,
    turnId,
    transcriptPath: transcript,
    timestamp: '1970-01-01T00:16:40.000Z',
  });
  tracker.poll({
    event: 'Stop',
    sessionId,
    turnId,
    transcriptPath: transcript,
    timestamp: '1970-01-01T00:16:46.000Z',
  }, 1006000);

  const state = tracker.state;
  assert.equal(state.workspace, 'demo');
  assert.equal(state.model, 'gpt-test');
  assert.equal(state.status, 'AWAITING_NEXT');
  assert.equal(state.tokens.total, 12100);
  assert.equal(state.context.used, 12000);
  assert.equal(state.context.limit, 200000);
  assert.equal(state.context.percent, 6);
  assert.equal(state.speed.ttft, 2);
  assert.equal(state.speed.overall, 25);
  assert.equal(state.tools.count, 1);
  assert.equal(state.tools.last, 'exec_command');
  assert.equal(state.quota.fiveHour.usedPercent, 12.5);
  assert.equal(state.quota.weekly.usedPercent, 4);
});

test('tool presentation and overlapping tool wait are deterministic', () => {
  assert.equal(toolStatus('exec_command').status, 'RUNNING_CMD');
  assert.equal(toolStatus('apply_patch').status, 'CODING');
  assert.equal(toolStatus('spawn_agent').status, 'THINKING');
  assert.equal(sumToolWait([
    { start: 1000, end: 2000 },
    { start: 1500, end: 2500 },
    { start: 4000, end: null },
  ], 1000, 5000), 2500);
});
