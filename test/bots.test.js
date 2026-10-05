import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/index.js';
import { runBots } from '../scripts/bots.mjs';

test('bots join a lobby, answer on their own, and the game completes', async () => {
  const app = createApp({ db: openDb(':memory:'), env: {}, distDir: '/nonexistent' });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const { token } = await (await fetch(`${base}/api/host/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
    const host = (action, body = {}) => fetch(`${base}/api/game/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    await host('open', { config: { questionCount: 2, timed: true, timeLimit: 8, categories: ['Science'], shuffleQuestions: false } });

    const botsDone = runBots({ url: base, count: 4, speed: 40, log: () => {} });
    // Drive the game as the host once all four have joined.
    for (let i = 0; i < 100 && app.game.players.size < 4; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(app.game.players.size, 4, 'all bots joined');
    await host('start');
    for (let q = 0; q < 2; q++) {
      await host('show');
      for (let i = 0; i < 200 && app.game.current.answers.size < 4; i++) await new Promise((r) => setTimeout(r, 50));
      assert.equal(app.game.current.answers.size, 4, `all bots answered question ${q + 1}`);
      await host('reveal');
      await host('next');
    }
    assert.equal(app.game.phase, 'finished');
    const results = await botsDone;
    assert.equal(results.length, 4);
  } finally { await app.close(); }
});
