import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { Game, GameError } from '../server/game.js';

function setup(questions, over = {}) {
  const db = openDb(':memory:', { seed: false });
  questions.forEach((q) => db.createQuestion(q));
  let t = 1_000_000;
  const timers = [];
  const game = new Game({
    db,
    now: () => t,
    setTimer: (fn, ms) => { const h = { fn, at: t + ms, live: true }; timers.push(h); return h; },
    clearTimer: (h) => { if (h) h.live = false; },
  });
  const advance = (ms) => {
    t += ms;
    for (const h of timers) if (h.live && h.at <= t) { h.live = false; h.fn(); }
  };
  return { db, game, advance, config: { shuffleQuestions: false, shuffleOptions: false, speedBonus: false, questionCount: 0, ...over } };
}

const GOLD = { category: 'Science', question: 'Gold?', options: ['Au', 'Ag', 'Pt'], answer: 'Au', explanation: 'Latin aurum' };
const CAP = { category: 'Geo', type: 'write_in', question: 'Capital of Canada?', answer: 'Ottawa' };
const DOG = { category: 'Science', question: 'Dog?', options: ['Canis', 'Felis'], answer: 'Canis' };

test('a full individual game scores, ranks and saves to history', () => {
  const { game, db, config } = setup([GOLD, DOG], config0());
  function config0() { return { timed: false }; }
  game.openLobby(config);
  const ann = game.join({ name: 'Ann' });
  const bo = game.join({ name: 'Bo' });
  game.start();
  game.showQuestion();
  game.answer(ann.id, 'Au');
  game.answer(bo.id, 'Ag');
  game.reveal();
  assert.equal(game.standings().players[0].name, 'Ann');
  assert.equal(game.standings().players[0].score, 10);
  game.next();
  game.showQuestion();
  game.answer(ann.id, 'Felis');
  game.answer(bo.id, 'Canis');
  game.reveal();
  game.next();
  assert.equal(game.phase, 'finished');
  const saved = db.getGame(game.savedGameId);
  assert.equal(saved.status, 'finished');
  assert.deepEqual(saved.players.map((p) => [p.name, p.score, p.rank]), [['Ann', 10, 1], ['Bo', 10, 1]]);
  game.close();
  assert.equal(game.phase, 'idle');
});

test('correct answers never leave the server before the reveal', () => {
  const { game, config } = setup([GOLD], { timed: false });
  game.openLobby(config);
  const p = game.join({ name: 'Ann' });
  game.start();
  assert.equal(game.viewFor({ role: 'screen' }).question, undefined, 'no question text while only "ready"');
  assert.ok(game.viewFor({ role: 'host' }).question.answer, 'host previews everything');
  game.showQuestion();
  for (const who of [{ role: 'screen' }, { role: 'player', playerId: p.id }]) {
    const q = game.viewFor(who).question;
    assert.equal(q.answer, undefined);
    assert.equal(q.explanation, undefined);
    assert.equal(JSON.stringify(game.viewFor(who)).includes('Latin aurum'), false);
  }
  game.answer(p.id, 'Au');
  game.reveal();
  assert.equal(game.viewFor({ role: 'screen' }).question.answer, 'Au');
});

test('the timer locks the question and rejects late answers', () => {
  const { game, advance, config } = setup([GOLD], { timed: true, timeLimit: 10 });
  game.openLobby(config);
  const p = game.join({ name: 'Ann' });
  game.start();
  game.showQuestion();
  advance(9000);
  assert.equal(game.phase, 'question');
  game.addTime(5);
  advance(5000);
  assert.equal(game.phase, 'question', 'extra time pushed the deadline');
  advance(2000);
  assert.equal(game.phase, 'locked');
  assert.throws(() => game.answer(p.id, 'Au'), GameError);
});

test('speed bonus, joker and half credit all flow into scores', () => {
  const { game, advance, config } = setup([GOLD, { ...CAP, category: 'Zoology' }], { timed: true, timeLimit: 30, speedBonus: true, pointsPerQuestion: 10 }); // questions list by category, so GOLD (Science) comes first
  game.openLobby(config);
  const fast = game.join({ name: 'Fast' });
  const slow = game.join({ name: 'Slow' });
  game.start();
  game.showQuestion();
  game.setJoker(fast.id, true);
  game.answer(fast.id, 'Au');           // instant: 10 + 5 = 15, x2 joker = 30
  advance(15000);
  game.answer(slow.id, 'Au');           // half time left: 10 + round(2.5)=13
  game.reveal();
  const scores = Object.fromEntries(game.standings().players.map((p) => [p.name, p.score]));
  assert.deepEqual(scores, { Fast: 30, Slow: 13 });
  assert.throws(() => { game.next(); game.showQuestion(); game.setJoker(fast.id, true); }, /already used/);

  // write-in: auto-match gives full credit, the host can lower it to half
  game.answer(fast.id, 'ottawa');
  game.answer(slow.id, 'Toronto');
  game.reveal();
  assert.equal(game.current.results.get(fast.id).credit, 1);
  assert.equal(game.current.results.get(slow.id).credit, 0);
  game.grade(slow.id, 0.5);
  assert.equal(game.current.results.get(slow.id).points, 5);
  game.grade(fast.id, 0.5);
  assert.equal(game.standings().players.find((p) => p.name === 'Fast').score, 35);
});

test('team games balance players and score teams by average', () => {
  const { game, config } = setup([GOLD], { timed: false, mode: 'teams', teamCount: 2, teamAssign: 'auto' });
  game.openLobby(config);
  const ps = ['A', 'B', 'C', 'D', 'E'].map((name) => game.join({ name }));
  const sizes = game.standings().teams.map((t) => t.members).sort();
  assert.deepEqual(sizes, [2, 3]);
  game.start();
  game.showQuestion();
  ps.forEach((p) => game.answer(p.id, 'Au'));
  game.reveal();
  assert.ok(game.standings().teams.every((t) => t.score === 10), 'average, not sum');
  game.movePlayer(ps[0].id, game.teams[1].id);
  assert.throws(() => game.movePlayer(ps[0].id, 'nope'), GameError);
});

test('category rounds create a round end between rounds', () => {
  const { game, config } = setup([GOLD, DOG, CAP], { timed: false, roundMode: 'category' });
  game.openLobby(config);
  assert.deepEqual(game.rounds.map((r) => [r.name, r.questions.length]).sort(), [['Geo', 1], ['Science', 2]]);
  game.start();
  const walk = () => { game.showQuestion(); game.reveal(); game.next(); };
  const lengths = game.rounds.map((r) => r.questions.length);
  for (let i = 0; i < lengths[0]; i++) walk();
  assert.equal(game.phase, 'roundEnd');
  game.next();
  assert.equal(game.phase, 'ready');
  assert.equal(game.roundIndex, 1);
});

test('guards: no joining without a game, duplicate names, bad answers, early end', () => {
  const { game, db, config } = setup([GOLD], { timed: false });
  assert.throws(() => game.join({ name: 'Ann' }), /no game/);
  assert.throws(() => game.showQuestion(), GameError);
  game.openLobby(config);
  const ann = game.join({ name: 'Ann' });
  assert.throws(() => game.join({ name: ' ann ' }), /taken/);
  assert.throws(() => game.join({ name: '   ' }), /name/);
  game.start();
  game.showQuestion();
  assert.throws(() => game.answer(ann.id, 'Gold-ish'), /options/);
  assert.throws(() => game.answer('ghost', 'Au'), /Join/);
  game.answer(ann.id, 'Au');
  game.reveal();
  game.end();
  assert.equal(db.getGame(game.savedGameId).status, 'ended early');
});

test('an abandoned game with no answers is not saved', () => {
  const { game, db, config } = setup([GOLD], { timed: false });
  game.openLobby(config);
  game.end();
  assert.equal(game.savedGameId, null);
  assert.equal(db.listGames().length, 0);
});

test('opening a lobby with no matching questions is refused', () => {
  const { game, config } = setup([GOLD], { categories: ['Nope'] });
  assert.throws(() => game.openLobby(config), /No questions/);
  assert.equal(game.phase, 'idle');
});

test('kicking removes a player and their answer', () => {
  const { game, config } = setup([GOLD], { timed: false });
  game.openLobby(config);
  const p = game.join({ name: 'Ann' });
  game.start();
  game.showQuestion();
  game.answer(p.id, 'Au');
  game.kick(p.id);
  assert.equal(game.players.size, 0);
  assert.equal(game.current.answers.size, 0);
});
