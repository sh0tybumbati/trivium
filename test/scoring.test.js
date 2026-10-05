import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnswer, matchesWriteIn, matchesChoice, pointsFor, rank, teamScore } from '../server/scoring.js';

test('normalizeAnswer strips case, accents, punctuation and articles', () => {
  assert.equal(normalizeAnswer('  The Beatles! '), 'beatles');
  assert.equal(normalizeAnswer('Café  Au-Lait'), 'cafe au lait');
  assert.equal(normalizeAnswer('Rock & Roll'), 'rock and roll');
  assert.equal(normalizeAnswer(null), '');
});

test('write-in matching allows alternatives and small typos on longer answers', () => {
  assert.ok(matchesWriteIn('everest', 'Mt Everest|Everest'));
  assert.ok(matchesWriteIn('Mount Everst', 'Mount Everest'), 'one typo on a long answer');
  assert.ok(!matchesWriteIn('cat', 'cut'), 'short answers must be exact');
  assert.ok(!matchesWriteIn('', 'anything'));
  assert.ok(!matchesWriteIn('Paris', 'London'));
});

test('multiple choice compares exactly, ignoring case and padding', () => {
  assert.ok(matchesChoice(' au ', 'Au'));
  assert.ok(!matchesChoice('Ag', 'Au'));
});

test('pointsFor: base, speed bonus, half credit, joker', () => {
  const base = { base: 10, credit: 1, responseMs: 0, limitMs: 30000, speedBonus: false, joker: false };
  assert.equal(pointsFor(base), 10);
  assert.equal(pointsFor({ ...base, speedBonus: true }), 15, 'instant answer earns the full +50%');
  assert.equal(pointsFor({ ...base, speedBonus: true, responseMs: 15000 }), 13, 'half the time left earns +25% (rounded)');
  assert.equal(pointsFor({ ...base, speedBonus: true, responseMs: 30000 }), 10, 'no time left, no bonus');
  assert.equal(pointsFor({ ...base, credit: 0 }), 0);
  assert.equal(pointsFor({ ...base, credit: 0.5, speedBonus: true }), 5, 'no speed bonus on partial credit');
  assert.equal(pointsFor({ ...base, joker: true }), 20);
  assert.equal(pointsFor({ ...base, credit: 0, joker: true }), 0, 'a wasted joker earns nothing');
});

test('rank gives ties the same rank and skips the next', () => {
  const ranked = rank([
    { name: 'A', score: 30 },
    { name: 'B', score: 50 },
    { name: 'C', score: 30 },
    { name: 'D', score: 10 },
  ]);
  assert.deepEqual(ranked.map((r) => [r.name, r.rank]), [['B', 1], ['A', 2], ['C', 2], ['D', 4]]);
});

test('teamScore averages by default so uneven teams stay fair', () => {
  assert.equal(teamScore([10, 20, 30]), 20);
  assert.equal(teamScore([10, 20, 30], 'sum'), 60);
  assert.equal(teamScore([]), 0);
});
