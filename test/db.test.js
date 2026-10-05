import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, cleanQuestion } from '../server/db.js';

const mcq = (over = {}) => ({ category: 'Science', question: 'Gold symbol?', options: ['Au', 'Ag'], answer: 'Au', ...over });

test('a fresh database is seeded with playable questions', () => {
  const db = openDb(':memory:');
  assert.ok(db.questionCount() >= 30);
  assert.ok(db.categories().length >= 5);
  assert.ok(db.listQuestions().some((q) => q.type === 'write_in'));
});

test('seed can be skipped and CRUD round-trips', () => {
  const db = openDb(':memory:', { seed: false });
  assert.equal(db.questionCount(), 0);
  const created = db.createQuestion(mcq());
  assert.equal(created.options.length, 2);
  const updated = db.updateQuestion(created.id, mcq({ question: 'New text?' }));
  assert.equal(updated.question, 'New text?');
  assert.equal(db.updateQuestion(9999, mcq()), null);
  assert.ok(db.deleteQuestion(created.id));
  assert.ok(!db.deleteQuestion(created.id));
});

test('validation rejects bad questions with readable messages', () => {
  assert.throws(() => cleanQuestion(mcq({ category: '' })), /Category/);
  assert.throws(() => cleanQuestion(mcq({ options: ['Au'] })), /2 to 6/);
  assert.throws(() => cleanQuestion(mcq({ options: ['Au', 'Au'] })), /2 to 6/, 'duplicates collapse to one option');
  assert.equal(cleanQuestion(mcq({ options: ['Au', 'Ag', 'Au'] })).options.length, 2);
  assert.throws(() => cleanQuestion(mcq({ answer: 'Pt' })), /one of the options/);
  assert.throws(() => cleanQuestion(mcq({ imageUrl: 'javascript:alert(1)' })), /http/);
  const wi = cleanQuestion({ category: 'X', type: 'write_in', question: 'Capital?', answer: '' });
  assert.deepEqual(wi.options, [], 'write-in needs no options or answer');
});

test('answer match on options is case-insensitive', () => {
  assert.equal(cleanQuestion(mcq({ answer: 'au' })).type, 'multiple_choice');
});

test('import keeps valid rows and reports invalid ones', () => {
  const db = openDb(':memory:', { seed: false });
  const result = db.importQuestions([mcq(), { category: '', question: 'x' }, mcq({ question: 'Second?' })]);
  assert.equal(result.imported, 2);
  assert.deepEqual(result.errors.map((e) => e.row), [2]);
  assert.throws(() => db.importQuestions('nope'), /array/);
});

test('settings persist as JSON', () => {
  const db = openDb(':memory:', { seed: false });
  assert.equal(db.getSetting('x', 'dflt'), 'dflt');
  db.setSetting('x', { a: [1, 2] });
  assert.deepEqual(db.getSetting('x'), { a: [1, 2] });
});

test('saved games keep standings and feed question stats', () => {
  const db = openDb(':memory:', { seed: false });
  const q = db.createQuestion(mcq());
  const id = db.saveGame({
    title: 'Friday', mode: 'individual', status: 'finished', config: { rounds: 1 }, startedAt: '2026-01-01T20:00:00Z',
    players: [{ id: 'p1', name: 'Ann', score: 15, rank: 1 }, { id: 'p2', name: 'Bo', score: 0, rank: 2 }],
    answers: [
      { questionId: q.id, roundIndex: 0, playerId: 'p1', answer: 'Au', credit: 1, points: 15, joker: false, responseMs: 1200 },
      { questionId: q.id, roundIndex: 0, playerId: 'p2', answer: 'Ag', credit: 0, points: 0, joker: false, responseMs: 4000 },
    ],
  });
  assert.equal(db.listGames()[0].players, 2);
  assert.equal(db.getGame(id).players[0].name, 'Ann');
  assert.deepEqual(db.questionStats().get(q.id), { answers: 2, correct: 1 });
  assert.ok(db.deleteGame(id));
  assert.equal(db.getGame(id), null);
});
