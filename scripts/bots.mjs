#!/usr/bin/env node
// Fake players for solo testing: they join the open lobby and answer like a room would.
// Usage: npm run bots -- --count 8 [--url http://localhost:3001] [--code ABCD] [--speed 1]
import { pathToFileURL } from 'node:url';
import WebSocket from 'ws';

const NAMES = ['Quiz Whiz', 'Trivia Newton', 'Les Miserables', 'Nacho Average', 'Ctrl Alt Defeat', 'Pun Intended', 'Know It Owl', 'Brainstorm', 'Fact Check', 'Wiki Pedia', 'Mind Flayer', 'Smarty Pants'];
const GUESSES = ['Ottawa', 'Toronto', 'Blue whale', 'no idea', 'Paris', 'Elephant', 'Gold'];
const rand = (n) => Math.floor(Math.random() * n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{ url?: string, count?: number, code?: string, speed?: number, log?: (msg: string) => void, signal?: AbortSignal }} opts
 * Resolves with the bots' final scores when the game finishes (or the signal aborts).
 */
export async function runBots({ url = 'http://localhost:3001', count = 6, code = '', speed = 1, log = console.log, signal } = {}) {
  const base = url.replace(/\/$/, '');
  const post = async (path, body, token) => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-player-token': token } : {}) }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data;
  };

  // Wait for a lobby to exist.
  let info;
  while (!signal?.aborted) {
    info = await fetch(`${base}/api/info`).then((r) => r.json()).catch(() => null);
    if (info && !['idle', 'finished'].includes(info.phase)) break;
    log('Waiting for the host to open a lobby...');
    await sleep(2000);
  }
  if (signal?.aborted) return [];

  const bots = [];
  const finals = new Map();
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });

  const spawn = async (i) => {
    const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : '');
    const state = { name, token: null, answeredFor: null, jokerTried: false };
    // Team games with "choose" need a team id; take it from a socket peek.
    const view = await new Promise((resolve) => {
      const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', role: 'screen' })));
      ws.on('message', (m) => { const msg = JSON.parse(m); if (msg.type === 'state') { resolve(msg.state); ws.close(); } });
    });
    const teams = view.teams ?? [];
    const teamId = view.options?.teamAssign === 'choose' && teams.length ? teams[rand(teams.length)].id : undefined;
    const joined = await post('/api/play/join', { name, teamId, code });
    state.token = joined.token;
    log(`+ ${name} joined${teamId ? ` (team ${teams.find((t) => t.id === teamId)?.name})` : ''}`);

    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', role: 'player', token: state.token })));
    ws.on('message', async (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type !== 'state') return;
      const s = msg.state;
      if (s.phase === 'finished' && s.me) {
        finals.set(name, s.me.score);
        if (finals.size >= bots.length) finish();
        return;
      }
      if (s.phase !== 'question' || !s.question || !s.me) return;
      const key = `${s.questionNumber}`;
      if (state.answeredFor === key) return;
      state.answeredFor = key;

      const limit = s.timer?.endsAt ? Math.max(1500, s.timer.endsAt - s.serverNow - 1500) : 12_000;
      await sleep((600 + rand(Math.min(limit, 10_000))) / speed);
      try {
        if (s.options?.jokers && !s.me.jokerSpent && !state.jokerTried && Math.random() < 0.15) {
          state.jokerTried = true;
          await post('/api/play/joker', { on: true }, state.token);
        }
        const q = s.question;
        const value = q.type === 'multiple_choice' ? q.options[rand(q.options.length)] : GUESSES[rand(GUESSES.length)];
        await post('/api/play/answer', { value }, state.token);
        log(`  ${name} answered`);
      } catch (err) {
        log(`  ${name}: ${err.message}`);
      }
    });
    bots.push({ name, ws });
    signal?.addEventListener('abort', () => ws.close());
  };

  for (let i = 0; i < count; i++) {
    try { await spawn(i); } catch (err) { log(`! bot ${i + 1} could not join: ${err.message}`); }
    await sleep(150 / speed);
  }
  if (!bots.length) return [];
  signal?.addEventListener('abort', finish);
  await done;
  for (const b of bots) b.ws.close();
  const results = [...finals.entries()].sort((a, b) => b[1] - a[1]);
  log('Game over. Final bot scores: ' + results.map(([n, s]) => `${n} ${s}`).join(', '));
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
  const ctrl = new AbortController();
  process.on('SIGINT', () => ctrl.abort());
  runBots({ url: args.url, count: Number(args.count ?? 6), code: args.code ?? '', speed: Number(args.speed ?? 1), signal: ctrl.signal })
    .then(() => process.exit(0))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
