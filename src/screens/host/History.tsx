import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { GameDetail, GameSummary, QuestionRecord } from '../../lib/types';
import { Button, Chip, Frame, Notice, Spinner } from '../../ui/Deco';
import { useRun } from './useRun';

const when = (iso: string) => new Date(iso.includes('T') || iso.endsWith('Z') ? iso : `${iso.replace(' ', 'T')}Z`).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export function History() {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [open, setOpen] = useState<GameDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const { busy, error, run } = useRun();

  const load = useCallback(() => {
    api<GameSummary[]>('GET', '/api/games', undefined, 'host').then(setGames).catch((e: Error) => setLoadError(e.message));
    api<QuestionRecord[]>('GET', '/api/questions', undefined, 'host').then(setQuestions).catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  const insights = useMemo(() => {
    const asked = questions.filter((q) => (q.stats?.answers ?? 0) >= 3).map((q) => ({ q, rate: q.stats!.correct / q.stats!.answers }));
    return { hardest: [...asked].sort((a, b) => a.rate - b.rate).slice(0, 5), easiest: [...asked].sort((a, b) => b.rate - a.rate).slice(0, 5) };
  }, [questions]);

  const show = (id: number) => run(async () => setOpen(await api<GameDetail>('GET', `/api/games/${id}`, undefined, 'host')));
  const del = (g: GameSummary) => {
    if (!window.confirm(`Delete "${g.title}" from history? This cannot be undone.`)) return;
    void run(async () => { await api('DELETE', `/api/games/${g.id}`, undefined, 'host'); setOpen(null); load(); });
  };

  if (loadError) return <Notice tone="error">{loadError}</Notice>;
  if (!games) return <div className="grid place-items-center py-24"><Spinner label="Loading history" /></div>;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-3">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {!games.length ? <Notice>No finished games yet. Finish a game and it shows up here with its final standings.</Notice> : (
          <ul className="space-y-2">
            {games.map((g) => (
              <li key={g.id}>
                <Frame cut={8} inner="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="font-semibold">{g.title}</div>
                    <div className="text-sm text-mute">{when(g.started_at)} &middot; {g.players} {g.players === 1 ? 'player' : 'players'} &middot; {g.mode === 'teams' ? 'Teams' : 'Individuals'}</div>
                  </div>
                  <Chip>{g.status}</Chip>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => show(g.id)}>Standings</Button>
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => del(g)}>Delete</Button>
                </Frame>
              </li>
            ))}
          </ul>
        )}
        {open ? (
          <Frame inner="p-5" tone="jade">
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="display text-xl text-gold-light">{open.title}</h2>
              <span className="text-sm text-mute">{when(open.started_at)}</span>
              <button className="ml-auto text-sm text-mute hover:text-cream" onClick={() => setOpen(null)}>Close</button>
            </div>
            <ol className="divide-y divide-gold/15">
              {open.players.map((p) => (
                <li key={p.player_id} className="flex items-center gap-4 py-2">
                  <span className="num w-8 text-center text-xl text-gold-light">{p.rank}</span>
                  <span className="flex-1 font-semibold">{p.name}{p.team ? <span className="ml-2 text-sm font-normal text-mute">{p.team}</span> : null}</span>
                  <span className="num text-xl">{p.score}</span>
                </li>
              ))}
            </ol>
          </Frame>
        ) : null}
      </div>

      <aside className="space-y-5">
        <Insight title="Hardest questions" rows={insights.hardest} />
        <Insight title="Easiest questions" rows={insights.easiest} />
        <p className="text-xs text-mute">Based on questions answered by at least three players across saved games.</p>
      </aside>
    </div>
  );
}

function Insight({ title, rows }: { title: string; rows: { q: QuestionRecord; rate: number }[] }) {
  return (
    <Frame inner="p-4">
      <h2 className="display mb-2 text-lg text-gold-light">{title}</h2>
      {!rows.length ? <p className="text-sm text-mute">Not enough data yet.</p> : (
        <ol className="space-y-2">
          {rows.map(({ q, rate }) => (
            <li key={q.id} className="flex gap-3 text-sm">
              <span className="num w-12 shrink-0 text-right text-gold-light">{Math.round(rate * 100)}%</span>
              <span className="min-w-0 flex-1">{q.question}</span>
            </li>
          ))}
        </ol>
      )}
    </Frame>
  );
}
