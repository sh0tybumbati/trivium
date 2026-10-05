import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../server/db.js';
import { createApp } from '../server/index.js';

async function boot(env = {}) {
  const db = openDb(':memory:');
  const app = createApp({ db, env, distDir: '/nonexistent' });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = async (method, path, { body, token, player, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(player ? { 'x-player-token': player } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json };
  };
  /** Open a WebSocket, send hello, and keep the latest state. */
  const socket = (hello, { origin } = {}) => new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws', origin ? { headers: { origin } } : undefined);
    const box = { ws, state: null, messages: [] };
    ws.on('message', (m) => { const msg = JSON.parse(m); box.messages.push(msg); if (msg.type === 'state') box.state = msg.state; });
    ws.on('open', () => { ws.send(JSON.stringify({ type: 'hello', ...hello })); setTimeout(() => resolve(box), 120); });
    ws.on('error', reject);
    ws.on('unexpected-response', () => reject(new Error('rejected')));
  });
  const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));
  return { ...app, base, call, socket, settle };
}

const hostToken = async (s) => (await s.call('POST', '/api/host/login', { body: {} })).json.token;

test('host access: local without a PIN works, proxied traffic is refused, a PIN gates everyone', async () => {
  const s = await boot();
  try {
    assert.equal((await s.call('POST', '/api/host/login', { body: {}, headers: { 'x-forwarded-for': '203.0.113.9' } })).status, 403);
    const local = await s.call('POST', '/api/host/login', { body: {} });
    assert.equal(local.status, 200);
    const token = local.json.token;

    assert.equal((await s.call('GET', '/api/questions')).status, 401, 'questions need a host token');
    assert.equal((await s.call('PUT', '/api/host/pin', { token, body: { pin: '12' } })).status, 400);
    const set = await s.call('PUT', '/api/host/pin', { token, body: { pin: '4827' } });
    assert.equal(set.status, 200);

    assert.equal((await s.call('GET', '/api/questions', { token })).status, 401, 'setting a PIN signs old sessions out');
    assert.equal((await s.call('POST', '/api/host/login', { body: {} })).status, 401, 'now a PIN is required even locally');
    assert.equal((await s.call('POST', '/api/host/login', { body: { pin: '0000' } })).status, 401);
    const ok = await s.call('POST', '/api/host/login', { body: { pin: '4827' }, headers: { 'x-forwarded-for': '203.0.113.9' } });
    assert.equal(ok.status, 200, 'with the PIN a remote host can sign in');
    assert.equal((await s.call('GET', '/api/questions', { token: ok.json.token })).status, 200);
  } finally { await s.close(); }
});

test('login attempts are rate limited', async () => {
  const s = await boot({ HOST_PIN: '9999' });
  try {
    const statuses = [];
    for (let i = 0; i < 8; i++) statuses.push((await s.call('POST', '/api/host/login', { body: { pin: 'bad' } })).status);
    assert.equal(statuses[0], 401);
    assert.equal(statuses.at(-1), 429);
    assert.equal((await s.call('PUT', '/api/host/pin', { token: 'x', body: { pin: '1234' } })).status, 401);
  } finally { await s.close(); }
});

test('a whole game over the wire: views are filtered and scores update live', async () => {
  const s = await boot();
  try {
    const token = await hostToken(s);
    const host = await s.socket({ role: 'host', token });
    const screen = await s.socket({ role: 'screen' });
    assert.equal(host.state.phase, 'idle');

    const open = await s.call('POST', '/api/game/open', { token, body: { config: { questionCount: 2, timed: false, speedBonus: false, shuffleQuestions: false, categories: ['Science'] } } });
    assert.equal(open.status, 200);
    await s.settle();
    assert.equal(screen.state.phase, 'lobby');

    const joined = await s.call('POST', '/api/play/join', { body: { name: 'Ann' } });
    assert.equal(joined.status, 200);
    const ann = await s.socket({ role: 'player', token: joined.json.token });
    assert.equal(ann.state.me.name, 'Ann');
    await s.settle();
    assert.equal(screen.state.players[0].connected, true);
    assert.equal(JSON.stringify(screen.state).includes(joined.json.token), false, 'tokens never reach other clients');

    await s.call('POST', '/api/game/start', { token });
    await s.call('POST', '/api/game/show', { token });
    await s.settle();
    const q = ann.state.question;
    assert.ok(q.text);
    assert.equal(q.answer, undefined, 'player cannot see the answer');
    assert.equal(screen.state.question.answer, undefined, 'screen cannot see the answer');
    const hostAnswer = host.state.question.answer;
    assert.ok(hostAnswer, 'host can');

    assert.equal((await s.call('POST', '/api/play/answer', { body: { value: hostAnswer } })).status, 401, 'answering needs a session');
    assert.equal((await s.call('POST', '/api/play/answer', { player: joined.json.token, body: { value: 'not an option' } })).status, 400);
    assert.equal((await s.call('POST', '/api/play/answer', { player: joined.json.token, body: { value: hostAnswer } })).status, 200);
    await s.settle();
    assert.equal(screen.state.answeredCount, 1);
    assert.equal(ann.state.me.answer, hostAnswer);

    assert.equal((await s.call('POST', '/api/game/reveal')).status, 401, 'players cannot drive the game');
    await s.call('POST', '/api/game/reveal', { token });
    await s.settle();
    assert.equal(screen.state.question.answer, hostAnswer);
    assert.equal(ann.state.me.score, 10);
    assert.equal(ann.state.me.rank, 1);

    ann.ws.close();
    await s.settle(200);
    assert.equal(screen.state.players[0].connected, false, 'disconnects show up');

    const back = await s.socket({ role: 'player', token: joined.json.token });
    await s.settle();
    assert.equal(back.state.me.score, 10, 'a returning phone keeps its score');
    assert.equal(screen.state.players[0].connected, true);

    await s.call('POST', '/api/game/end', { token });
    const games = await s.call('GET', '/api/games', { token });
    assert.equal(games.json.length, 1);
    assert.equal(games.json[0].status, 'ended early');
    for (const c of [host, screen, back]) c.ws.close();
  } finally { await s.close(); }
});

test('the join code can be required', async () => {
  const s = await boot({ REQUIRE_JOIN_CODE: '1' });
  try {
    const token = await hostToken(s);
    await s.call('POST', '/api/game/open', { token, body: { config: { timed: false } } });
    const code = (await s.socket({ role: 'host', token })).state.joinCode;
    assert.match(code, /^[A-Z]{4}$/);
    assert.equal((await s.call('POST', '/api/play/join', { body: { name: 'Ann' } })).status, 400);
    assert.equal((await s.call('POST', '/api/play/join', { body: { name: 'Ann', code: code.toLowerCase() } })).status, 200);
  } finally { await s.close(); }
});

test('sockets: hosts need a valid token, and foreign origins are refused', async () => {
  const s = await boot();
  try {
    const bad = await s.socket({ role: 'host', token: 'nope' });
    assert.ok(bad.messages.some((m) => m.type === 'unauthorized'));
    await assert.rejects(() => s.socket({ role: 'screen' }, { origin: 'https://evil.example' }));
    const same = await s.socket({ role: 'screen' }, { origin: new URL(s.base).origin });
    assert.equal(same.state.phase, 'idle');
    same.ws.close();
  } finally { await s.close(); }
});

test('sockets behind a proxy: the forwarded host counts as the same origin', async () => {
  const s = await boot();
  try {
    const open = (headers) => new Promise((resolve) => {
      const ws = new WebSocket(s.base.replace('http', 'ws') + '/ws', { headers });
      ws.on('open', () => { ws.close(); resolve(true); });
      ws.on('error', () => resolve(false));
      ws.on('unexpected-response', () => resolve(false));
    });
    assert.equal(await open({ origin: 'https://trivia.example.com', 'x-forwarded-host': 'trivia.example.com' }), true);
    assert.equal(await open({ origin: 'https://trivia.example.com', 'x-forwarded-host': 'other.example.com' }), false);
    assert.equal(await open({ origin: 'not a url' }), false);
  } finally { await s.close(); }
});

test('question bank API: validation errors are readable, export and import round-trip', async () => {
  const s = await boot();
  try {
    const token = await hostToken(s);
    const list = await s.call('GET', '/api/questions', { token });
    assert.ok(list.json.length >= 30);
    assert.ok(list.json[0].stats);
    const bad = await s.call('POST', '/api/questions', { token, body: { category: 'X', question: 'Q?', options: ['a'], answer: 'a' } });
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /2 to 6/);
    const made = await s.call('POST', '/api/questions', { token, body: { category: 'X', question: 'Q?', options: ['a', 'b'], answer: 'a' } });
    assert.equal(made.status, 200);
    assert.equal((await s.call('PUT', '/api/questions/99999', { token, body: { category: 'X', question: 'Q?', options: ['a', 'b'], answer: 'a' } })).status, 404);
    assert.equal((await s.call('DELETE', `/api/questions/${made.json.id}`, { token })).status, 200);

    const exported = await fetch(s.base + '/api/export', { headers: { authorization: `Bearer ${token}` } });
    const data = await exported.json();
    assert.ok(data.every((q) => q.id === undefined));
    const imp = await s.call('POST', '/api/import', { token, body: { questions: [...data.slice(0, 2), { category: '', question: 'bad' }], replace: true } });
    assert.deepEqual([imp.json.imported, imp.json.errors.length], [2, 1]);
    assert.equal((await s.call('GET', '/api/questions', { token })).json.length, 2);
  } finally { await s.close(); }
});
