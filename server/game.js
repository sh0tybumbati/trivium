import { randomBytes, randomInt } from 'node:crypto';
import { matchesChoice, matchesWriteIn, pointsFor, rank, teamScore } from './scoring.js';

export const PHASES = ['idle', 'lobby', 'ready', 'question', 'locked', 'reveal', 'roundEnd', 'finished'];

const TEAM_PRESETS = [
  { name: 'Gold', color: '#d4af37' },
  { name: 'Emerald', color: '#2fbf8f' },
  { name: 'Ruby', color: '#d8454f' },
  { name: 'Sapphire', color: '#4f86e0' },
  { name: 'Amethyst', color: '#9a6ad8' },
  { name: 'Amber', color: '#e8892b' },
  { name: 'Jade', color: '#7bc96f' },
  { name: 'Pearl', color: '#d9d4c7' },
];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L, O to avoid look-alikes

export const DEFAULT_CONFIG = {
  title: 'Trivia Night',
  subtitle: 'Get ready to play!',
  mode: 'individual', // 'individual' | 'teams'
  teamCount: 3,
  teamAssign: 'choose', // 'choose' | 'auto'
  teamScoring: 'average', // 'average' | 'sum'
  categories: [], // empty = all
  questionCount: 10, // 0 = every matching question (per round in category mode)
  shuffleQuestions: true,
  shuffleOptions: true,
  roundMode: 'single', // 'single' | 'size' | 'category'
  roundSize: 5,
  pointsPerQuestion: 10,
  timed: true,
  timeLimit: 30,
  speedBonus: true,
  jokers: true,
  audio: true,
  showCounter: true,
};

const clamp = (n, lo, hi, fallback) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;
};
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const text = (v, max, fallback) => {
  const s = String(v ?? '').trim().slice(0, max);
  return s || fallback;
};

export function cleanConfig(input = {}) {
  const d = DEFAULT_CONFIG;
  const c = input ?? {};
  return {
    title: text(c.title, 60, d.title),
    subtitle: text(c.subtitle, 100, d.subtitle),
    mode: oneOf(c.mode, ['individual', 'teams'], d.mode),
    teamCount: clamp(c.teamCount, 2, TEAM_PRESETS.length, d.teamCount),
    teamAssign: oneOf(c.teamAssign, ['choose', 'auto'], d.teamAssign),
    teamScoring: oneOf(c.teamScoring, ['average', 'sum'], d.teamScoring),
    categories: Array.isArray(c.categories) ? c.categories.map((x) => String(x).slice(0, 40)).slice(0, 50) : [],
    questionCount: clamp(c.questionCount, 0, 500, d.questionCount),
    shuffleQuestions: bool(c.shuffleQuestions, d.shuffleQuestions),
    shuffleOptions: bool(c.shuffleOptions, d.shuffleOptions),
    roundMode: oneOf(c.roundMode, ['single', 'size', 'category'], d.roundMode),
    roundSize: clamp(c.roundSize, 1, 100, d.roundSize),
    pointsPerQuestion: clamp(c.pointsPerQuestion, 1, 1000, d.pointsPerQuestion),
    timed: bool(c.timed, d.timed),
    timeLimit: clamp(c.timeLimit, 5, 300, d.timeLimit),
    speedBonus: bool(c.speedBonus, d.speedBonus),
    jokers: bool(c.jokers, d.jokers),
    audio: bool(c.audio, d.audio),
    showCounter: bool(c.showCounter, d.showCounter),
  };
}

export class GameError extends Error {}

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class Game {
  /**
   * @param {object} deps
   * @param {ReturnType<import('./db.js').openDb>} deps.db
   * @param {() => number} [deps.now]
   * @param {(fn: Function, ms: number) => any} [deps.setTimer]
   * @param {(handle: any) => void} [deps.clearTimer]
   * @param {() => void} [deps.onChange]
   */
  constructor({ db, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, onChange = () => {} }) {
    this.db = db;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onChange = onChange;
    this.reset();
  }

  reset() {
    if (this.lockTimer) this.clearTimer(this.lockTimer);
    this.lockTimer = null;
    this.phase = 'idle';
    this.config = null;
    this.joinCode = null;
    this.rounds = [];
    this.roundIndex = 0;
    this.qIndex = 0;
    this.players = new Map(); // id -> player
    this.teams = [];
    this.current = null; // live question state
    this.log = []; // finished answers, for persistence
    this.startedAt = null;
    this.showLeaderboard = false;
    this.savedGameId = null;
  }

  // ---------- helpers ----------

  changed() {
    this.onChange();
  }

  assertPhase(...allowed) {
    if (!allowed.includes(this.phase)) throw new GameError(`Not possible while the game is ${this.phase}.`);
  }

  get round() {
    return this.rounds[this.roundIndex] ?? null;
  }

  get question() {
    return this.round?.questions[this.qIndex] ?? null;
  }

  get totalQuestions() {
    return this.rounds.reduce((n, r) => n + r.questions.length, 0);
  }

  questionNumber() {
    let n = 0;
    for (let i = 0; i < this.roundIndex; i++) n += this.rounds[i].questions.length;
    return n + this.qIndex + 1;
  }

  playerScore(player) {
    let total = 0;
    for (const p of player.points.values()) total += p;
    return total;
  }

  // ---------- host: setup and flow ----------

  openLobby(rawConfig) {
    this.assertPhase('idle');
    const config = cleanConfig(rawConfig);
    const rounds = this.buildRounds(config);
    if (!rounds.length) throw new GameError('No questions match those categories. Add questions or pick different categories.');

    this.config = config;
    this.rounds = rounds;
    this.roundIndex = 0;
    this.qIndex = 0;
    this.joinCode = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    this.teams = config.mode === 'teams'
      ? TEAM_PRESETS.slice(0, config.teamCount).map((t, i) => ({ id: `t${i + 1}`, ...t }))
      : [];
    this.startedAt = new Date(this.now()).toISOString();
    this.phase = 'lobby';
    this.changed();
  }

  buildRounds(config) {
    let pool = this.db.listQuestions();
    if (config.categories.length) {
      const wanted = new Set(config.categories.map((c) => c.toLowerCase()));
      pool = pool.filter((q) => wanted.has(q.category.toLowerCase()));
    }
    const prep = (list) => {
      let out = config.shuffleQuestions ? shuffled(list) : list;
      if (config.questionCount > 0) out = out.slice(0, config.questionCount);
      return out.map((q) => ({ ...q, options: config.shuffleOptions && q.type === 'multiple_choice' ? shuffled(q.options) : q.options }));
    };

    if (config.roundMode === 'category') {
      const order = config.categories.length ? config.categories : [...new Set(pool.map((q) => q.category))];
      return order
        .map((cat) => ({ name: cat, questions: prep(pool.filter((q) => q.category.toLowerCase() === cat.toLowerCase())) }))
        .filter((r) => r.questions.length);
    }

    const questions = prep(pool);
    if (!questions.length) return [];
    if (config.roundMode === 'size') {
      const rounds = [];
      for (let i = 0; i < questions.length; i += config.roundSize) {
        rounds.push({ name: `Round ${rounds.length + 1}`, questions: questions.slice(i, i + config.roundSize) });
      }
      return rounds;
    }
    return [{ name: 'The Quiz', questions }];
  }

  start() {
    this.assertPhase('lobby');
    this.toReady();
  }

  toReady() {
    this.phase = 'ready';
    this.current = null;
    this.showLeaderboard = false;
    this.changed();
  }

  showQuestion() {
    this.assertPhase('ready');
    const durationMs = this.config.timed ? this.config.timeLimit * 1000 : 0;
    const openedAt = this.now();
    this.current = {
      openedAt,
      durationMs,
      endsAt: durationMs ? openedAt + durationMs : null,
      answers: new Map(), // playerId -> { answer, at }
      jokers: new Set(), // playerIds who armed their joker for this question
      grades: new Map(), // playerId -> credit override from the host
      results: new Map(), // playerId -> { credit, points, joker } once revealed
    };
    this.phase = 'question';
    this.showLeaderboard = false;
    this.scheduleLock();
    this.changed();
  }

  scheduleLock() {
    if (this.lockTimer) this.clearTimer(this.lockTimer);
    this.lockTimer = null;
    if (this.phase !== 'question' || !this.current?.endsAt) return;
    this.lockTimer = this.setTimer(() => {
      this.lockTimer = null;
      if (this.phase === 'question') this.lock();
    }, Math.max(0, this.current.endsAt - this.now()));
  }

  addTime(seconds) {
    this.assertPhase('question');
    if (!this.current.endsAt) throw new GameError('This game is not timed.');
    const extra = clamp(seconds, 1, 120, 10) * 1000;
    this.current.endsAt += extra;
    this.current.durationMs += extra;
    this.scheduleLock();
    this.changed();
  }

  lock() {
    this.assertPhase('question');
    if (this.lockTimer) this.clearTimer(this.lockTimer);
    this.lockTimer = null;
    this.phase = 'locked';
    this.changed();
  }

  reveal() {
    this.assertPhase('question', 'locked');
    if (this.lockTimer) this.clearTimer(this.lockTimer);
    this.lockTimer = null;
    for (const playerId of this.current.answers.keys()) this.scoreEntry(playerId);
    this.phase = 'reveal';
    this.changed();
  }

  /** Work out credit and points for one player's answer to the current question. */
  scoreEntry(playerId) {
    const cur = this.current;
    const player = this.players.get(playerId);
    const entry = cur?.answers.get(playerId);
    if (!player || !entry) return;
    const q = this.question;

    let credit;
    if (cur.grades.has(playerId)) credit = cur.grades.get(playerId);
    else if (q.type === 'multiple_choice') credit = matchesChoice(entry.answer, q.answer) ? 1 : 0;
    else credit = q.answer && matchesWriteIn(entry.answer, q.answer) ? 1 : 0;

    const joker = this.config.jokers && cur.jokers.has(playerId);
    const points = pointsFor({
      base: this.config.pointsPerQuestion,
      credit,
      responseMs: entry.at - cur.openedAt,
      limitMs: this.config.timed ? this.config.timeLimit * 1000 : 0,
      speedBonus: this.config.speedBonus,
      joker,
    });
    cur.results.set(playerId, { credit, points, joker });
    player.points.set(`${this.roundIndex}:${this.qIndex}`, points);
    if (joker) player.jokerSpent = true;
  }

  grade(playerId, credit) {
    this.assertPhase('reveal');
    if (![0, 0.5, 1].includes(credit)) throw new GameError('Credit must be 0, 0.5 or 1.');
    if (!this.current.answers.has(playerId)) throw new GameError('That player did not answer.');
    this.current.grades.set(playerId, credit);
    this.scoreEntry(playerId);
    this.changed();
  }

  next() {
    this.assertPhase('reveal', 'roundEnd');
    if (this.phase === 'roundEnd') {
      this.roundIndex += 1;
      this.qIndex = 0;
      return this.toReady();
    }
    this.commitQuestion();
    this.advance();
  }

  skip() {
    this.assertPhase('ready', 'question', 'locked');
    if (this.lockTimer) this.clearTimer(this.lockTimer);
    this.lockTimer = null;
    this.current = null;
    this.advance();
  }

  /** Move past the current question: next question, round end, or the finish. */
  advance() {
    this.current = null;
    if (this.qIndex + 1 < this.round.questions.length) {
      this.qIndex += 1;
      return this.toReady();
    }
    if (this.roundIndex + 1 < this.rounds.length) {
      this.phase = 'roundEnd';
      this.showLeaderboard = false;
      return this.changed();
    }
    this.finish('finished');
  }

  /** Append the revealed question's answers to the permanent log. */
  commitQuestion() {
    const cur = this.current;
    const q = this.question;
    if (!cur) return;
    for (const [playerId, entry] of cur.answers) {
      const result = cur.results.get(playerId) ?? { credit: 0, points: 0, joker: false };
      this.log.push({
        questionId: q.id,
        roundIndex: this.roundIndex,
        playerId,
        answer: entry.answer,
        credit: result.credit,
        points: result.points,
        joker: result.joker,
        responseMs: entry.at - cur.openedAt,
      });
    }
  }

  /** End the game early (or after the last question) and save it to history. */
  end() {
    this.assertPhase('lobby', 'ready', 'question', 'locked', 'reveal', 'roundEnd');
    if (this.phase === 'reveal') this.commitQuestion();
    this.finish(this.log.length ? 'ended early' : 'abandoned');
  }

  finish(status) {
    if (this.lockTimer) this.clearTimer(this.lockTimer);
    this.lockTimer = null;
    this.current = null;
    this.phase = 'finished';
    this.showLeaderboard = false;
    if (this.log.length && this.savedGameId == null) {
      const ranked = rank([...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: this.teamName(p.teamId), score: this.playerScore(p) })));
      this.savedGameId = this.db.saveGame({
        title: this.config.title,
        mode: this.config.mode,
        status,
        config: this.config,
        startedAt: this.startedAt,
        players: ranked,
        answers: this.log,
      });
    }
    this.changed();
  }

  /** Clear everything and go back to the setup screen. */
  close() {
    this.assertPhase('finished', 'lobby', 'idle');
    this.reset();
    this.changed();
  }

  toggleLeaderboard() {
    this.assertPhase('lobby', 'ready', 'reveal', 'roundEnd');
    this.showLeaderboard = !this.showLeaderboard;
    this.changed();
  }

  // ---------- teams and players ----------

  teamName(teamId) {
    return this.teams.find((t) => t.id === teamId)?.name ?? '';
  }

  join({ name, teamId, code, codeRequired = false }) {
    if (!['lobby', 'ready', 'question', 'locked', 'reveal', 'roundEnd'].includes(this.phase)) {
      throw new GameError('There is no game to join right now.');
    }
    if (codeRequired && String(code ?? '').trim().toUpperCase() !== this.joinCode) throw new GameError('That join code is not right.');
    const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!clean) throw new GameError('Please enter a name.');
    if ([...this.players.values()].some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      throw new GameError('That name is taken. Pick another.');
    }
    if (this.players.size >= 200) throw new GameError('This game is full.');

    let team = null;
    if (this.config.mode === 'teams') {
      if (this.config.teamAssign === 'choose' && teamId) {
        team = this.teams.find((t) => t.id === teamId);
        if (!team) throw new GameError('Pick one of the teams.');
      } else {
        team = this.smallestTeam();
      }
    }
    const player = {
      id: randomBytes(6).toString('hex'),
      token: randomBytes(24).toString('hex'),
      name: clean,
      teamId: team?.id ?? null,
      connected: true,
      jokerSpent: false,
      points: new Map(),
    };
    this.players.set(player.id, player);
    this.changed();
    return player;
  }

  smallestTeam() {
    const counts = new Map(this.teams.map((t) => [t.id, 0]));
    for (const p of this.players.values()) if (p.teamId) counts.set(p.teamId, (counts.get(p.teamId) ?? 0) + 1);
    return [...this.teams].sort((a, b) => counts.get(a.id) - counts.get(b.id))[0];
  }

  playerByToken(token) {
    if (!token) return null;
    for (const p of this.players.values()) if (p.token === token) return p;
    return null;
  }

  setConnected(playerId, connected) {
    const p = this.players.get(playerId);
    if (p && p.connected !== connected) {
      p.connected = connected;
      this.changed();
    }
  }

  kick(playerId) {
    if (!this.players.delete(playerId)) throw new GameError('No such player.');
    this.current?.answers.delete(playerId);
    this.current?.jokers.delete(playerId);
    this.changed();
  }

  movePlayer(playerId, teamId) {
    const p = this.players.get(playerId);
    if (!p) throw new GameError('No such player.');
    if (this.config.mode !== 'teams') throw new GameError('This is not a team game.');
    if (!this.teams.some((t) => t.id === teamId)) throw new GameError('No such team.');
    p.teamId = teamId;
    this.changed();
  }

  renameTeam(teamId, name) {
    const t = this.teams.find((x) => x.id === teamId);
    if (!t) throw new GameError('No such team.');
    t.name = text(name, 24, t.name);
    this.changed();
  }

  // ---------- players: answering ----------

  answer(playerId, value) {
    this.assertPhase('question');
    const player = this.players.get(playerId);
    if (!player) throw new GameError('Join the game first.');
    const q = this.question;
    let answer = String(value ?? '').trim();
    if (!answer) throw new GameError('Answer cannot be empty.');
    if (q.type === 'multiple_choice') {
      const match = q.options.find((o) => o.toLowerCase() === answer.toLowerCase());
      if (!match) throw new GameError('That is not one of the options.');
      answer = match;
    } else {
      answer = answer.slice(0, 200);
    }
    if (this.current.endsAt && this.now() > this.current.endsAt + 500) throw new GameError('Time is up.');
    this.current.answers.set(playerId, { answer, at: this.now() });
    this.changed();
  }

  setJoker(playerId, on) {
    this.assertPhase('question');
    if (!this.config.jokers) throw new GameError('Jokers are off for this game.');
    const player = this.players.get(playerId);
    if (!player) throw new GameError('Join the game first.');
    if (on) {
      if (player.jokerSpent) throw new GameError('You already used your joker.');
      this.current.jokers.add(playerId);
    } else {
      this.current.jokers.delete(playerId);
    }
    this.changed();
  }

  // ---------- views ----------

  standings() {
    const players = [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, teamId: p.teamId, connected: p.connected, score: this.playerScore(p),
    }));
    const rankedPlayers = rank(players);
    let rankedTeams = [];
    if (this.config?.mode === 'teams') {
      rankedTeams = rank(this.teams.map((t) => {
        const members = players.filter((p) => p.teamId === t.id);
        return { id: t.id, name: t.name, color: t.color, members: members.length, score: teamScore(members.map((m) => m.score), this.config.teamScoring) };
      }));
    }
    return { players: rankedPlayers, teams: rankedTeams };
  }

  /**
   * What a given audience may see. Correct answers stay on the server until the
   * reveal, so a peek at network traffic gives nothing away.
   * @param {{ role: 'host' | 'screen' | 'player', playerId?: string }} who
   */
  viewFor({ role, playerId }) {
    const host = role === 'host';
    const cfg = this.config;
    const base = { phase: this.phase, serverNow: this.now() };
    if (this.phase === 'idle' || !cfg) return base;

    const { players, teams } = this.standings();
    const q = this.question;
    const cur = this.current;
    const revealed = this.phase === 'reveal';

    const view = {
      ...base,
      title: cfg.title,
      subtitle: cfg.subtitle,
      mode: cfg.mode,
      joinCode: this.joinCode,
      options: {
        timed: cfg.timed, speedBonus: cfg.speedBonus, jokers: cfg.jokers, audio: cfg.audio, showCounter: cfg.showCounter,
        teamAssign: cfg.teamAssign, teamScoring: cfg.teamScoring, points: cfg.pointsPerQuestion,
      },
      showLeaderboard: this.showLeaderboard,
      players,
      teams,
      rounds: this.rounds.map((r) => ({ name: r.name, questions: r.questions.length })),
      roundIndex: this.roundIndex,
      roundName: this.round?.name ?? '',
      questionIndex: this.qIndex,
      questionNumber: this.round ? this.questionNumber() : 0,
      totalQuestions: this.totalQuestions,
    };

    // Nobody but the host sees a question until it is shown.
    const questionVisible = ['question', 'locked', 'reveal'].includes(this.phase) || (host && this.phase === 'ready');
    if (q && questionVisible) {
      view.question = {
        id: q.id,
        type: q.type,
        category: q.category,
        text: q.question,
        options: q.options,
        imageUrl: q.imageUrl,
        // The answer only leaves the server at reveal (or for the host).
        ...(revealed || host ? { answer: q.answer, explanation: q.explanation } : {}),
      };
    }

    if (cur) {
      view.timer = { durationMs: cur.durationMs, endsAt: cur.endsAt };
      view.answeredCount = cur.answers.size;
      view.connectedCount = players.filter((p) => p.connected).length;

      if (revealed || host) {
        const counts = {};
        for (const { answer } of cur.answers.values()) counts[answer] = (counts[answer] ?? 0) + 1;
        view.optionCounts = counts;
      }
      if (revealed) {
        view.results = [...cur.results.entries()].map(([id, r]) => ({
          playerId: id,
          name: this.players.get(id)?.name ?? '',
          answer: cur.answers.get(id)?.answer ?? '',
          ...r,
        })).sort((a, b) => b.points - a.points);
      }
      if (host) {
        view.submissions = [...cur.answers.entries()].map(([id, a]) => {
          const r = cur.results.get(id);
          return {
            playerId: id,
            name: this.players.get(id)?.name ?? '',
            answer: a.answer,
            joker: cur.jokers.has(id),
            responseMs: a.at - cur.openedAt,
            credit: r?.credit ?? null,
            points: r?.points ?? null,
          };
        });
      }
    }

    if (host) {
      view.config = cfg;
      view.savedGameId = this.savedGameId;
      view.roster = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, connected: p.connected, jokerSpent: p.jokerSpent }));
    }

    if (role === 'player') {
      const me = this.players.get(playerId);
      if (me) {
        const mine = players.find((p) => p.id === me.id);
        view.me = {
          id: me.id,
          name: me.name,
          teamId: me.teamId,
          score: mine?.score ?? 0,
          rank: mine?.rank ?? 0,
          jokerSpent: me.jokerSpent,
          jokerArmed: cur?.jokers.has(me.id) ?? false,
          answer: cur?.answers.get(me.id)?.answer ?? null,
          result: cur?.results.get(me.id) ?? null,
        };
      }
    }
    return view;
  }
}
