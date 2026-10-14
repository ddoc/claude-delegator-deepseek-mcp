import test from 'node:test';
import assert from 'node:assert/strict';
import { RepositoryActionError, runRepositoryLoop } from '../src/repository.mjs';

test('repository loop preserves full history and awaits execution and hooks', async () => {
  const actions = [
    { action: 'list' }, { action: 'read', path: 'hello.txt' },
    { action: 'write', path: 'hello.txt', content: 'updated' },
    { action: 'finish', summary: 'Updated hello.txt; tests not run.' },
  ];
  const order = [];
  const histories = [];
  const result = await runRepositoryLoop({
    prompt: 'Update hello.txt',
    call: async ({ messages, step }) => {
      order.push(`call:${step}`);
      histories.push(messages);
      assert.equal(messages.length, 2 + (step - 1) * 2);
      return { action: actions[step - 1], usage: { promptTokens: 3, completionTokens: 1 } };
    },
    execute: async action => {
      await Promise.resolve();
      order.push(`execute:${action.action}`);
      return action.action === 'read' ? 'original' : { path: action.path };
    },
    onStep: async ({ step }) => { await Promise.resolve(); order.push(`hook:${step}`); },
  });
  assert.deepEqual(result, { summary: actions[3].summary, steps: 4, usage: { promptTokens: 12, completionTokens: 4 } });
  assert.deepEqual(order, ['call:1', 'execute:list', 'hook:1', 'call:2', 'execute:read', 'hook:2', 'call:3', 'execute:write', 'hook:3', 'call:4', 'hook:4']);
  assert.equal(JSON.parse(histories[2][5].content).result, 'original');
  assert.deepEqual(JSON.parse(histories[3][6].content), actions[2]);
});

test('repository loop rejects unknown, missing, malformed, and escaping actions before execution', async () => {
  for (const action of [null, {}, { action: 'shell', command: 'pwd' }, { action: 'read' },
    { action: 'write', path: 'file' }, { action: 'finish' }, { action: 'finish', summary: '' },
    { action: 'read', path: '../secret' }, { action: 'read', path: '/secret' },
    { action: 'write', path: 'file', content: '', command: 'pwd' }]) {
    let executed = false;
    await assert.rejects(runRepositoryLoop({ prompt: 'task', call: async () => action,
      execute: async () => { executed = true; } }), TypeError);
    assert.equal(executed, false);
  }
});

test('repository loop bounds turns and does not undo host changes on exhaustion', async () => {
  const writes = [];
  await assert.rejects(runRepositoryLoop({ prompt: 'task', maxSteps: 2,
    call: async () => ({ action: 'write', path: 'file', content: 'value' }),
    execute: async action => writes.push(action) }), /exhausted its 2 step limit/);
  assert.equal(writes.length, 2);
});

test('repository loop propagates provider failures without calling executor', async () => {
  const failure = new Error('provider failed');
  await assert.rejects(runRepositoryLoop({ prompt: 'task',
    call: async () => { throw failure; }, execute: async () => assert.fail('unexpected execution') }), error => error === failure);
});

test('only explicit host refusals become safe observations', async () => {
  let calls = 0;
  await runRepositoryLoop({ prompt: 'task', call: async ({ messages }) => {
    if (calls++ === 0) return { action: 'read', path: 'protected' };
    assert.deepEqual(JSON.parse(messages.at(-1).content), { ok: false, error: { code: 'protected_path' } });
    return { action: 'finish', summary: 'Blocked by host policy.' };
  }, execute: async () => { throw new RepositoryActionError('protected_path'); } });
  const failure = new Error('host I/O failure');
  await assert.rejects(runRepositoryLoop({ prompt: 'task', call: async () => ({ action: 'list' }),
    execute: async () => { throw failure; } }), error => error === failure);
});

test('provider cannot mutate history and malformed usage cannot poison totals', async () => {
  let calls = 0;
  const result = await runRepositoryLoop({ prompt: 'task', call: async ({ messages }) => {
    assert.equal(messages[1].content, 'task');
    messages[1].content = 'mutated';
    return calls++ === 0 ? { action: { action: 'list' }, usage: { totalTokens: 2, invalid: -1, infinite: Infinity } }
      : { action: { action: 'finish', summary: 'Done.' }, usage: { totalTokens: 3 } };
  }, execute: async () => [] });
  assert.deepEqual(result.usage, { totalTokens: 5 });
});

test('repository loop validates configuration and observations', async () => {
  for (const maxSteps of [0, 1.5, 1001]) {
    await assert.rejects(runRepositoryLoop({ prompt: 'task', call() {}, execute() {}, maxSteps }), RangeError);
  }
  const circular = {}; circular.self = circular;
  await assert.rejects(runRepositoryLoop({ prompt: 'task', call: async () => ({ action: 'list' }),
    execute: async () => circular }), /observation must be JSON serializable/);
});
