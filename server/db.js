import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SEED_QUESTIONS } from './seed.js';

const MIGRATIONS = [
  // 1: questions, settings, game history
  `
  CREATE TABLE questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (type IN ('multiple_choice', 'write_in')),
    question TEXT NOT NULL,
    options TEXT NOT NULL DEFAULT '[]',
    answer TEXT NOT NULL DEFAULT '',
    explanation TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    config TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE game_players (
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    name TEXT NOT NULL,
    team TEXT NOT NULL DEFAULT '',
    score INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    PRIMARY KEY (game_id, player_id)
  );
  CREATE TABLE game_answers (
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    question_id INTEGER,
    round_index INTEGER NOT NULL,
    player_id TEXT NOT NULL,
    answer TEXT NOT NULL,
    credit REAL NOT NULL,
    points INTEGER NOT NULL,
    joker INTEGER NOT NULL DEFAULT 0,
    response_ms INTEGER
  );
  CREATE INDEX game_answers_question ON game_answers(question_id);
  `,
];

/** Bad input from a user: safe to show the message, maps to HTTP 400. */
export class ValidationError extends Error {}

const MAX = { category: 40, question: 500, option: 120, answer: 200, explanation: 500, url: 500 };

/** Validate and normalise a question from untrusted input. Throws Error with a readable message. */
export function cleanQuestion(input) {
  const q = input ?? {};
  const str = (v) => String(v ?? '').trim();
  const type = q.type === 'write_in' ? 'write_in' : 'multiple_choice';
  const category = str(q.category);
  const question = str(q.question);
  const answer = str(q.answer);
  const explanation = str(q.explanation);
  const imageUrl = str(q.imageUrl ?? q.image_url);

  if (!category || category.length > MAX.category) throw new ValidationError(`Category is required (max ${MAX.category} characters).`);
  if (!question || question.length > MAX.question) throw new ValidationError(`Question text is required (max ${MAX.question} characters).`);
  if (answer.length > MAX.answer) throw new ValidationError(`Answer is too long (max ${MAX.answer} characters).`);
  if (explanation.length > MAX.explanation) throw new ValidationError(`Explanation is too long (max ${MAX.explanation} characters).`);
  if (imageUrl && (!/^https?:\/\//i.test(imageUrl) || imageUrl.length > MAX.url)) throw new ValidationError('Image must be an http(s) URL.');

  let options = [];
  if (type === 'multiple_choice') {
    const raw = Array.isArray(q.options) ? q.options : [];
    options = [...new Set(raw.map(str).filter(Boolean))];
    if (options.length < 2 || options.length > 6) throw new ValidationError('Multiple choice needs 2 to 6 distinct options.');
    if (options.some((o) => o.length > MAX.option)) throw new ValidationError(`Options are limited to ${MAX.option} characters.`);
    if (!options.some((o) => o.toLowerCase() === answer.toLowerCase())) throw new ValidationError('The answer must be one of the options.');
  }
  return { category, type, question, options, answer, explanation, imageUrl };
}

const rowToQuestion = (r) => ({
  id: r.id,
  category: r.category,
  type: r.type,
  question: r.question,
  options: JSON.parse(r.options),
  answer: r.answer,
  explanation: r.explanation,
  imageUrl: r.image_url,
});

export function openDb(path = ':memory:', { seed = true } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const version = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  const q = {
    all: db.prepare('SELECT * FROM questions ORDER BY category COLLATE NOCASE, id'),
    byCategory: db.prepare('SELECT * FROM questions WHERE category = ? COLLATE NOCASE ORDER BY id'),
    one: db.prepare('SELECT * FROM questions WHERE id = ?'),
    insert: db.prepare('INSERT INTO questions (category, type, question, options, answer, explanation, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    update: db.prepare("UPDATE questions SET category=?, type=?, question=?, options=?, answer=?, explanation=?, image_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"),
    remove: db.prepare('DELETE FROM questions WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM questions'),
    categories: db.prepare('SELECT category, COUNT(*) AS count FROM questions GROUP BY category COLLATE NOCASE ORDER BY category COLLATE NOCASE'),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    insertGame: db.prepare('INSERT INTO games (title, mode, status, config, started_at) VALUES (?, ?, ?, ?, ?)'),
    insertGamePlayer: db.prepare('INSERT INTO game_players (game_id, player_id, name, team, score, rank) VALUES (?, ?, ?, ?, ?, ?)'),
    insertGameAnswer: db.prepare('INSERT INTO game_answers (game_id, question_id, round_index, player_id, answer, credit, points, joker, response_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    games: db.prepare(`
      SELECT g.id, g.title, g.mode, g.status, g.started_at, g.ended_at,
             (SELECT COUNT(*) FROM game_players p WHERE p.game_id = g.id) AS players
      FROM games g ORDER BY g.id DESC LIMIT ?`),
    game: db.prepare('SELECT * FROM games WHERE id = ?'),
    gamePlayers: db.prepare('SELECT player_id, name, team, score, rank FROM game_players WHERE game_id = ? ORDER BY rank, name'),
    deleteGame: db.prepare('DELETE FROM games WHERE id = ?'),
    questionStats: db.prepare(`
      SELECT question_id, COUNT(*) AS answers, SUM(CASE WHEN credit >= 1 THEN 1 ELSE 0 END) AS correct
      FROM game_answers WHERE question_id IS NOT NULL GROUP BY question_id`),
  };

  const tx = (fn) => {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  const api = {
    raw: db,
    close: () => db.close(),

    listQuestions: ({ category } = {}) => (category ? q.byCategory.all(category) : q.all.all()).map(rowToQuestion),
    getQuestion: (id) => {
      const row = q.one.get(id);
      return row ? rowToQuestion(row) : null;
    },
    createQuestion(input) {
      const c = cleanQuestion(input);
      const { lastInsertRowid } = q.insert.run(c.category, c.type, c.question, JSON.stringify(c.options), c.answer, c.explanation, c.imageUrl);
      return api.getQuestion(Number(lastInsertRowid));
    },
    updateQuestion(id, input) {
      const c = cleanQuestion(input);
      const { changes } = q.update.run(c.category, c.type, c.question, JSON.stringify(c.options), c.answer, c.explanation, c.imageUrl, id);
      return changes ? api.getQuestion(id) : null;
    },
    deleteQuestion: (id) => q.remove.run(id).changes > 0,
    categories: () => q.categories.all(),
    questionCount: () => q.count.get().n,

    /** Import a list; invalid rows are reported, valid ones are kept. */
    importQuestions(list, { replace = false } = {}) {
      if (!Array.isArray(list)) throw new ValidationError('Expected a JSON array of questions.');
      if (list.length > 2000) throw new ValidationError('Import is limited to 2,000 questions at a time.');
      const errors = [];
      let imported = 0;
      tx(() => {
        if (replace) db.exec('DELETE FROM questions');
        list.forEach((item, index) => {
          try {
            const c = cleanQuestion(item);
            q.insert.run(c.category, c.type, c.question, JSON.stringify(c.options), c.answer, c.explanation, c.imageUrl);
            imported++;
          } catch (err) {
            errors.push({ row: index + 1, error: err.message });
          }
        });
      });
      return { imported, errors };
    },

    getSetting(key, fallback = null) {
      const row = q.getSetting.get(key);
      return row ? JSON.parse(row.value) : fallback;
    },
    setSetting: (key, value) => void q.setSetting.run(key, JSON.stringify(value)),

    /** Persist a finished (or abandoned) game with its standings and every answer. */
    saveGame({ title, mode, status, config, startedAt, players, answers }) {
      return tx(() => {
        const { lastInsertRowid } = q.insertGame.run(title, mode, status, JSON.stringify(config), startedAt);
        const gameId = Number(lastInsertRowid);
        for (const p of players) q.insertGamePlayer.run(gameId, p.id, p.name, p.team ?? '', p.score, p.rank);
        for (const a of answers) {
          q.insertGameAnswer.run(gameId, a.questionId ?? null, a.roundIndex, a.playerId, a.answer, a.credit, a.points, a.joker ? 1 : 0, a.responseMs ?? null);
        }
        return gameId;
      });
    },
    listGames: (limit = 50) => q.games.all(limit),
    getGame(id) {
      const game = q.game.get(id);
      if (!game) return null;
      return { ...game, config: JSON.parse(game.config), players: q.gamePlayers.all(id) };
    },
    deleteGame: (id) => q.deleteGame.run(id).changes > 0,

    /** answers / correct counts per question across all saved games. */
    questionStats() {
      const stats = new Map();
      for (const r of q.questionStats.all()) stats.set(r.question_id, { answers: r.answers, correct: r.correct });
      return stats;
    },
  };

  if (seed && api.questionCount() === 0) api.importQuestions(SEED_QUESTIONS);
  return api;
}
