# Running Trivium beyond one room

By default Trivium serves your local network, and the host console only opens on the machine running the server. This guide covers putting it online, keeping it running, and backing it up.

## Before you expose it

Set both of these first.

- **`HOST_PIN`** (or set a PIN in Settings). Without a PIN the host console refuses to open for anyone but the host machine. With a PIN, anyone who knows it can host.
- **`PUBLIC_URL`**, so the QR codes on the big screen and in the host console point at your public address instead of a LAN IP.

Optionally set `REQUIRE_JOIN_CODE=1`. Players then have to enter the four-letter code shown on the big screen, which stops strangers who find the link from joining.

## Cloudflare Tunnel

A tunnel needs no open ports and works behind a changing home IP address. With `cloudflared` installed and a tunnel created in the Cloudflare dashboard:

```bash
cloudflared tunnel run --url http://127.0.0.1:3001 <tunnel-name>
```

Route a hostname such as `trivia.example.com` to the tunnel, then start Trivium:

```bash
HOST_PIN=4827 PUBLIC_URL=https://trivia.example.com npm start
```

Trivium notices the forwarding headers a tunnel adds and treats those requests as remote, so the "host machine only" shortcut never applies to tunnelled traffic. WebSockets work through the tunnel without extra settings.

If you use your own reverse proxy instead (nginx, Caddy), pass WebSocket upgrades through and keep the original `Host` header, or send `X-Forwarded-Host`. Trivium refuses sockets whose browser origin does not match the host it was reached on.

## Keeping it running (systemd user service)

Save as `~/.config/systemd/user/trivium.service`:

```ini
[Unit]
Description=Trivium trivia server

[Service]
WorkingDirectory=%h/trivium
Environment=PORT=3001
EnvironmentFile=-%h/trivium/.env
ExecStart=/usr/bin/node server/index.js
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now trivium
loginctl enable-linger "$USER"   # start at boot, without logging in
```

After pulling an update, run `npm install && npm run build` and `systemctl --user restart trivium`.

## Backups

Everything lives in one SQLite file, `data/trivium.db` (or wherever `TRIVIUM_DB` points). To back it up while the server is running, use SQLite's online backup, which is safe mid-game:

```bash
sqlite3 data/trivium.db ".backup 'trivium-backup.db'"
```

Or stop the server and copy the file together with any `-wal` and `-shm` files beside it.

## Other hosts

Any host that runs Node 24 and keeps one long-lived process works, including a small VPS. Two things to know:

- Run **exactly one instance**. The live game is held in memory, so a second instance would be a second, separate game.
- Put the database on **persistent storage**. On platforms with a temporary filesystem the question bank and history disappear on every deploy unless you attach a disk and point `TRIVIUM_DB` at it.

## What a restart does

Questions, settings and finished games survive. A game in progress does not: players see the lobby disappear and rejoin the next game.
