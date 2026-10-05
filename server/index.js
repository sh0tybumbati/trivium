import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { openDb, ValidationError } from './db.js';
import { Game, GameError, DEFAULT_CONFIG } from './game.js';
import { checkPin, clientIp, createLimiter, createSessions, hashPin, isLocalRequest } from './auth.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (s) => createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => timingSafeEqual(sha(a), sha(b));

function lanUrls(port) {
  const urls = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${port}`);
  }
  return urls;
}

/**
 * Build the whole app (HTTP + WebSocket) without listening, so tests can start it on any port.
 * @param {{ db?: any, env?: Record<string,string|undefined>, distDir?: string }} [opts]
 */
export function createApp({ db = openDb(':memory:'), env = process.env, distDir = join(ROOT, 'dist') } = {}) {
  const sessions = createSessions();
  const loginLimit = createLimiter({ max: 6, windowMs: 60_000 });
  const joinLimit = createLimiter({ max: 40, windowMs: 60_000 });
  const playLimit = createLimiter({ max: 120, windowMs: 60_000 });
  const clients = new Set(); // { ws, role, playerId }
  let pending = null;

  const game = new Game({ db, onChange: scheduleBroadcast });
  const app = express();
  const server = createHttpServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  // ---------- push channel ----------

  function scheduleBroadcast() {
    if (pending) return;
    pending = setTimeout(flush, 40);
  }

  function flush() {
    pending = null;
    const cache = new Map();
    for (const c of clients) {
      if (c.ws.readyState !== 1 || !c.ready) continue;
      const key = c.role === 'player' ? `p:${c.playerId}` : c.role;
      if (!cache.has(key)) cache.set(key, JSON.stringify({ type: 'state', state: game.viewFor({ role: c.role, playerId: c.playerId }) }));
      c.ws.send(cache.get(key));
    }
  }

  function sendState(c) {
    c.ws.send(JSON.stringify({ type: 'state', state: game.viewFor({ role: c.role, playerId: c.playerId }) }));
  }

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const origin = req.headers.origin;
    // Browsers always send Origin; refuse cross-site pages from opening our socket.
    // Behind a proxy the original host may arrive in X-Forwarded-Host instead of Host.
    const hosts = [req.headers.host, String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim()].filter(Boolean);
    let originOk = true;
    if (origin) {
      try { originOk = hosts.includes(new URL(origin).host); } catch { originOk = false; }
    }
    if (url.pathname !== '/ws' || !originOk) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    const client = { ws, role: null, playerId: null, ready: false, alive: true };
    clients.add(client);
    const deadline = setTimeout(() => ws.close(4000, 'hello timeout'), 5000);

    ws.on('pong', () => { client.alive = true; });
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (client.ready || msg?.type !== 'hello') return;
      clearTimeout(deadline);

      if (msg.role === 'host') {
        if (!sessions.valid(msg.token)) { ws.send(JSON.stringify({ type: 'unauthorized' })); return ws.close(4001, 'unauthorized'); }
        client.role = 'host';
      } else if (msg.role === 'player') {
        client.role = 'player';
        const player = game.playerByToken(msg.token);
        if (player) {
          client.playerId = player.id;
          game.setConnected(player.id, true);
        } else if (msg.token) {
          ws.send(JSON.stringify({ type: 'session-expired' }));
        }
      } else {
        client.role = 'screen';
      }
      client.ready = true;
      sendState(client);
    });
    ws.on('close', () => {
      clearTimeout(deadline);
      clients.delete(client);
      if (client.playerId && ![...clients].some((c) => c.playerId === client.playerId)) game.setConnected(client.playerId, false);
    });
    ws.on('error', () => ws.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      c.ws.ping();
    }
  }, 30_000);
  heartbeat.unref();

  // ---------- http plumbing ----------

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; frame-ancestors 'none'",
    });
    next();
  });
  app.use(express.json({ limit: '2mb' }));

  const wrap = (fn) => async (req, res) => {
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (err) {
      const status = err.status ?? (err instanceof GameError || err instanceof ValidationError ? 400 : 500);
      if (status === 500) console.error(err);
      if (!res.headersSent) res.status(status).json({ error: status === 500 ? 'Something went wrong on the server.' : err.message });
    }
  };
  const fail = (status, error) => Object.assign(new Error(error), { status });

  const hostOnly = (req, res, next) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!sessions.valid(token)) return res.status(401).json({ error: 'Host sign-in required.' });
    next();
  };

  const playerFrom = (req) => {
    const player = game.playerByToken(req.headers['x-player-token']);
    if (!player) throw fail(401, 'Your session ended. Rejoin the game.');
    return player;
  };

  // ---------- public ----------

  app.get('/api/health', (req, res) => res.json({ ok: true, phase: game.phase, clients: clients.size }));

  app.get('/api/info', (req, res) => {
    const port = server.address()?.port ?? env.PORT ?? 3001;
    res.json({
      phase: game.phase,
      title: game.config?.title ?? 'Trivium',
      codeRequired: env.REQUIRE_JOIN_CODE === '1',
      hasPin: Boolean(env.HOST_PIN || db.getSetting('hostPin')),
      local: isLocalRequest(req),
      publicUrl: env.PUBLIC_URL || null,
      urls: lanUrls(port),
    });
  });

  // ---------- host sign-in ----------

  app.post('/api/host/login', wrap(async (req) => {
    if (!loginLimit(clientIp(req))) throw fail(429, 'Too many attempts. Wait a minute.');
    const stored = env.HOST_PIN ? null : db.getSetting('hostPin');
    const hasPin = Boolean(env.HOST_PIN || stored);
    if (!hasPin) {
      if (!isLocalRequest(req)) {
        throw fail(403, 'Host controls are limited to the host machine until you set a PIN. Open Trivium on that machine and set one, or start the server with HOST_PIN.');
      }
      return { token: sessions.issue(), hasPin: false };
    }
    const pin = String(req.body?.pin ?? '');
    const ok = env.HOST_PIN ? safeEqual(pin, env.HOST_PIN) : checkPin(pin, stored);
    if (!ok) throw fail(401, 'That PIN is not right.');
    return { token: sessions.issue(), hasPin: true };
  }));

  // ---------- players ----------

  app.post('/api/play/join', wrap((req) => {
    if (!joinLimit(clientIp(req))) throw fail(429, 'Too many tries. Wait a minute.');
    const { name, teamId, code } = req.body ?? {};
    const player = game.join({ name, teamId, code, codeRequired: env.REQUIRE_JOIN_CODE === '1' });
    return { token: player.token, playerId: player.id };
  }));

  app.post('/api/play/answer', wrap((req) => {
    const player = playerFrom(req);
    if (!playLimit(player.id)) throw fail(429, 'Slow down a little.');
    game.answer(player.id, req.body?.value);
  }));

  app.post('/api/play/joker', wrap((req) => {
    const player = playerFrom(req);
    game.setJoker(player.id, Boolean(req.body?.on));
  }));

  // ---------- host: game control ----------

  app.get('/api/setup', hostOnly, wrap(() => ({
    defaults: DEFAULT_CONFIG,
    last: db.getSetting('lastConfig'),
    categories: db.categories(),
    questionCount: db.questionCount(),
    hasPin: Boolean(env.HOST_PIN || db.getSetting('hostPin')),
    pinFromEnv: Boolean(env.HOST_PIN),
  })));

  const actions = {
    open: (b) => { game.openLobby(b.config); db.setSetting('lastConfig', game.config); },
    start: () => game.start(),
    show: () => game.showQuestion(),
    addTime: (b) => game.addTime(b.seconds),
    lock: () => game.lock(),
    reveal: () => game.reveal(),
    grade: (b) => game.grade(String(b.playerId), Number(b.credit)),
    next: () => game.next(),
    skip: () => game.skip(),
    end: () => game.end(),
    close: () => game.close(),
    leaderboard: () => game.toggleLeaderboard(),
    kick: (b) => game.kick(String(b.playerId)),
    move: (b) => game.movePlayer(String(b.playerId), String(b.teamId)),
    renameTeam: (b) => game.renameTeam(String(b.teamId), b.name),
  };

  app.post('/api/game/:action', hostOnly, wrap((req) => {
    const act = actions[req.params.action];
    if (!act) throw fail(404, 'Unknown action.');
    act(req.body ?? {});
  }));

  app.put('/api/host/pin', hostOnly, wrap((req) => {
    if (env.HOST_PIN) throw new GameError('The PIN is set by the HOST_PIN environment variable.');
    const pin = req.body?.pin;
    if (pin === null || pin === '') {
      db.setSetting('hostPin', null);
    } else {
      if (!/^\d{4,12}$/.test(String(pin))) throw new GameError('The PIN must be 4 to 12 digits.');
      db.setSetting('hostPin', hashPin(pin));
    }
    sessions.revokeAll();
    return { token: sessions.issue() };
  }));

  // ---------- host: questions and history ----------

  app.get('/api/questions', hostOnly, wrap(() => {
    const stats = db.questionStats();
    return db.listQuestions().map((q) => ({ ...q, stats: stats.get(q.id) ?? { answers: 0, correct: 0 } }));
  }));
  app.post('/api/questions', hostOnly, wrap((req) => db.createQuestion(req.body)));
  app.put('/api/questions/:id', hostOnly, wrap((req) => {
    const q = db.updateQuestion(Number(req.params.id), req.body);
    if (!q) throw fail(404, 'No such question.');
    return q;
  }));
  app.delete('/api/questions/:id', hostOnly, wrap((req) => {
    if (!db.deleteQuestion(Number(req.params.id))) throw fail(404, 'No such question.');
  }));
  app.get('/api/export', hostOnly, (req, res) => {
    res.set('Content-Disposition', 'attachment; filename="trivium-questions.json"');
    res.json(db.listQuestions().map(({ id, ...rest }) => rest));
  });
  app.post('/api/import', hostOnly, wrap((req) => db.importQuestions(req.body?.questions, { replace: Boolean(req.body?.replace) })));

  app.get('/api/games', hostOnly, wrap(() => db.listGames()));
  app.get('/api/games/:id', hostOnly, wrap((req) => {
    const g = db.getGame(Number(req.params.id));
    if (!g) throw fail(404, 'No such game.');
    return g;
  }));
  app.delete('/api/games/:id', hostOnly, wrap((req) => {
    if (!db.deleteGame(Number(req.params.id))) throw fail(404, 'No such game.');
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // ---------- static app ----------

  if (existsSync(join(distDir, 'index.html'))) {
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(join(distDir, 'index.html')));
  } else {
    app.get('/', (req, res) => res.type('text').send('Trivium server is running. Build the app with "npm run build", or use "npm run dev" and open the Vite address.'));
  }

  const close = () => new Promise((resolve) => {
    clearInterval(heartbeat);
    if (pending) clearTimeout(pending);
    for (const c of clients) c.ws.terminate();
    wss.close();
    server.close(() => resolve());
    server.closeAllConnections?.();
  });

  return { app, server, game, db, sessions, close };
}

// ---------- run ----------

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT ?? 3001);
  const dbPath = process.env.TRIVIUM_DB ?? join(ROOT, 'data', 'trivium.db');
  const { server, db, close } = createApp({ db: openDb(dbPath) });
  server.listen(port, process.env.HOST ?? '0.0.0.0', () => {
    console.log(`Trivium is running`);
    console.log(`  On this machine:  http://localhost:${port}`);
    for (const url of lanUrls(port)) console.log(`  On your network:  ${url}`);
    console.log(`  Questions in the bank: ${db.questionCount()}   Database: ${dbPath}`);
    if (!process.env.HOST_PIN && !db.getSetting('hostPin')) console.log('  Host controls: this machine only (set a PIN in the host console to open them up)');
  });
  const stop = async () => { await close(); db.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
