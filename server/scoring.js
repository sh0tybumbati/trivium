// Pure scoring and answer-matching rules. No I/O, so every rule is unit-tested.

/** Fraction of the base points added at most as a speed bonus. */
export const SPEED_BONUS_MAX = 0.5;

/** Strip case, accents, punctuation and leading articles so "The Beatles!" matches "beatles". */
export function normalizeAnswer(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an)\s+/, '');
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Typos allowed grow with answer length; short answers must be exact. */
function typoBudget(len) {
  if (len >= 9) return 2;
  if (len >= 5) return 1;
  return 0;
}

/**
 * Does a typed answer match the stored answer? The stored answer may list
 * alternatives separated by "|" ("Mt Everest|Everest").
 */
export function matchesWriteIn(typed, stored) {
  const guess = normalizeAnswer(typed);
  if (!guess) return false;
  return String(stored ?? '')
    .split('|')
    .map(normalizeAnswer)
    .filter(Boolean)
    .some((target) => guess === target || editDistance(guess, target) <= typoBudget(target.length));
}

/** Multiple choice compares the chosen option text exactly (case-insensitive). */
export function matchesChoice(chosen, correct) {
  return String(chosen ?? '').trim().toLowerCase() === String(correct ?? '').trim().toLowerCase();
}

/**
 * Points for one answer.
 * - credit: 0, 0.5 or 1 (multiple choice is 0 or 1; write-in can be half credit)
 * - speed bonus only applies to a fully-correct timed answer
 * - joker doubles whatever was earned
 */
export function pointsFor({ base, credit, responseMs, limitMs, speedBonus, joker }) {
  if (!credit) return 0;
  let points = Math.round(base * credit);
  if (speedBonus && credit === 1 && limitMs > 0 && Number.isFinite(responseMs)) {
    const remaining = Math.min(1, Math.max(0, (limitMs - responseMs) / limitMs));
    points += Math.round(base * SPEED_BONUS_MAX * remaining);
  }
  return joker ? points * 2 : points;
}

/** Competition ranking: ties share a rank and the next rank skips ("1, 1, 3"). */
export function rank(entries, scoreOf = (e) => e.score) {
  const sorted = [...entries].sort((a, b) => scoreOf(b) - scoreOf(a) || String(a.name).localeCompare(String(b.name)));
  let lastScore = null;
  let lastRank = 0;
  return sorted.map((entry, index) => {
    const score = scoreOf(entry);
    if (score !== lastScore) {
      lastRank = index + 1;
      lastScore = score;
    }
    return { ...entry, rank: lastRank };
  });
}

/** A team's score from its members' scores. */
export function teamScore(memberScores, mode = 'average') {
  if (!memberScores.length) return 0;
  const total = memberScores.reduce((sum, s) => sum + s, 0);
  return mode === 'sum' ? total : Math.round(total / memberScores.length);
}
