# Trivium

Trivia for a room of phones: a host console, a big-screen view, and player phones. Node 24+ (uses `node:sqlite`), React + Vite + Tailwind 3.

## Commands

- `npm run dev` runs the server (:3001) and Vite (:5173, proxies `/api` and `/ws`).
- `npm run build` typechecks then builds to `dist/`; `npm start` serves it.
- `npm test` runs `node --test test/` (scoring, db, game engine, server over real HTTP and WebSocket).
- `npm run typecheck`.

## How it fits together

- The server is authoritative. `server/game.js` is a phase machine (`idle, lobby, ready, question, locked, reveal, roundEnd, finished`). Every change calls `onChange`, which schedules a coalesced broadcast.
- Clients never mutate state over the socket. Hosts and players act through REST (`POST /api/game/:action` with a host bearer token, `POST /api/play/*` with `x-player-token`). The WebSocket only pushes `viewFor({role, playerId})`.
- `viewFor` is the secrecy boundary: correct answers and explanations are included only at `reveal` or for the host, and the question text is hidden from non-hosts until it is shown. A test asserts this. Do not add fields to a view without checking who can see them.
- Scoring lives in `server/scoring.js` as pure functions. Player points are stored per question and the score is derived, so host regrading is just recomputing one entry.
- Host sign-in: with no PIN set, only direct loopback requests with no proxy headers are "local". Tunnelled traffic arrives from 127.0.0.1 but carries forwarding headers, so it counts as remote.

## Gotchas

- Limelight's zero glyph looks like a half-moon. Numbers use the `.num` class (bold Josefin Sans), not `.display`.
- The big screen is sized in `vw`/`vh` for projectors, so keep sizes viewport-relative there.
- Questions list ordered by category then id, so tests that rely on question order must account for that.
- The host's last game settings are remembered in the `settings` table (`lastConfig`) and prefill the setup form.
- Seed questions (`server/seed.js`) are only inserted into an empty question table.
