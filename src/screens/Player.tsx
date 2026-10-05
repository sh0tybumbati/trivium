import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { KEYS, store } from '../lib/storage';
import { useCountdown } from '../lib/useCountdown';
import { useGame } from '../lib/useGame';
import type { GameView, ServerInfo } from '../lib/types';
import { Button, Chip, Divider, Frame, Logo, Notice, Spinner } from '../ui/Deco';
import { Podium } from '../ui/Podium';
import { Standings } from '../ui/Standings';
import { playerRows, teamRows } from '../ui/standingRows';
import { TimerBar } from '../ui/TimerBar';

export function Player() {
  const [token, setToken] = useState(() => store.get(KEYS.player));
  const { state, link, skew, expired } = useGame('player', token);

  useEffect(() => {
    if (expired) { store.remove(KEYS.player); setToken(null); }
  }, [expired]);

  const leave = () => { store.remove(KEYS.player); setToken(null); };

  if (!state) return <Shell><Spinner label={link === 'reconnecting' ? 'Reconnecting' : 'Connecting'} /></Shell>;
  if (!state.me) return <Join state={state} onJoined={(t) => { store.set(KEYS.player, t); setToken(t); }} />;
  return <Game state={state} skew={skew} offline={link !== 'open'} onLeave={leave} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative mx-auto grid min-h-dvh max-w-xl place-items-center px-5 py-8">
      <div className="rays pointer-events-none fixed inset-x-0 bottom-0 h-[55vh]" aria-hidden />
      <div className="relative w-full">{children}</div>
    </main>
  );
}

// ---------- joining ----------

function Join({ state, onJoined }: { state: GameView; onJoined: (token: string) => void }) {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('code') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api<ServerInfo>('GET', '/api/info').then(setInfo).catch(() => undefined); }, []);

  const open = state.phase !== 'idle' && state.phase !== 'finished';
  const choose = state.mode === 'teams' && state.options?.teamAssign === 'choose';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const out = await api<{ token: string }>('POST', '/api/play/join', { name, teamId: teamId || undefined, code });
      onJoined(out.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join.');
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="text-center"><Logo size="md" /></div>
      <Divider className="my-6" />
      {!open ? (
        <Frame inner="p-8 text-center">
          <h1 className="display text-2xl text-gold-light">{state.phase === 'finished' ? 'That game is over' : 'No game yet'}</h1>
          <p className="mt-2 text-mute">
            {state.phase === 'finished' ? 'Wait for the host to start the next one.' : 'The host has not opened a game. This page will update by itself.'}
          </p>
          <div className="mt-6 flex justify-center"><Spinner /></div>
        </Frame>
      ) : (
        <Frame inner="p-6">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <h1 className="display text-2xl text-gold-light">{state.title}</h1>
              <p className="text-sm text-mute">{state.subtitle}</p>
            </div>
            <div>
              <label className="label" htmlFor="name">Your name</label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoComplete="nickname" placeholder="Quiz Whiz" required />
            </div>
            {info?.codeRequired ? (
              <div>
                <label className="label" htmlFor="code">Join code</label>
                <input id="code" className="input uppercase tracking-[0.5em]" value={code} onChange={(e) => setCode(e.target.value)} maxLength={4} placeholder="ABCD" required />
              </div>
            ) : null}
            {choose ? (
              <fieldset>
                <legend className="label">Pick your team</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(state.teams ?? []).map((t) => (
                    <button
                      type="button" key={t.id} onClick={() => setTeamId(t.id)} aria-pressed={teamId === t.id}
                      className={`flex items-center gap-2 border px-3 py-3 text-left transition ${teamId === t.id ? 'border-gold-light bg-gold/15' : 'border-gold/25 hover:border-gold/60'}`}
                    >
                      <span className="h-3 w-3 shrink-0 rotate-45" style={{ background: t.color }} />
                      <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
                      <span className="text-xs text-mute">{t.members}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button type="submit" size="lg" className="w-full" disabled={busy || !name.trim() || (choose && !teamId)}>
              {busy ? 'Joining…' : 'Join the game'}
            </Button>
          </form>
        </Frame>
      )}
    </Shell>
  );
}

// ---------- in game ----------

function Game({ state, skew, offline, onLeave }: { state: GameView; skew: number; offline: boolean; onLeave: () => void }) {
  const me = state.me!;
  const team = state.teams?.find((t) => t.id === me.teamId);

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-xl flex-col px-4 pb-8 pt-3">
      <div className="rays pointer-events-none fixed inset-x-0 bottom-0 h-[50vh]" aria-hidden />
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-gold/25 bg-ink/90 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{me.name}</div>
            {team ? (
              <div className="flex items-center gap-1.5 text-xs text-mute"><span className="h-2 w-2 rotate-45" style={{ background: team.color }} />{team.name}</div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="num text-2xl leading-none text-gold-light">{me.score}</div>
            <div className="text-[0.65rem] uppercase tracking-[0.2em] text-mute">{me.rank ? `Rank ${me.rank} of ${state.players?.length ?? 0}` : 'points'}</div>
          </div>
        </div>
        {offline ? <div className="mt-2 text-center text-xs uppercase tracking-[0.2em] text-ruby" role="status">Reconnecting…</div> : null}
      </header>

      <div className="relative flex-1">
        <Body state={state} skew={skew} />
      </div>

      <footer className="relative mt-6 text-center">
        <button className="text-xs uppercase tracking-[0.2em] text-mute underline-offset-4 hover:text-gold-light hover:underline" onClick={onLeave}>Leave game</button>
      </footer>
    </div>
  );
}

function Body({ state, skew }: { state: GameView; skew: number }) {
  const me = state.me!;
  const show = state.showLeaderboard && ['lobby', 'ready', 'reveal'].includes(state.phase);
  const standings = (
    <div className="space-y-4">
      {state.mode === 'teams' ? <Standings rows={teamRows(state, me.teamId)} /> : null}
      <Standings rows={playerRows(state, me.id)} limit={state.mode === 'teams' ? 5 : 8} />
    </div>
  );

  if (show) return <Card title="Leaderboard">{standings}</Card>;

  switch (state.phase) {
    case 'lobby':
      return (
        <Card title="You're in!">
          <p className="text-mute">Waiting for the host to start. Keep this screen open.</p>
          <p className="mt-4 text-sm uppercase tracking-[0.2em] text-gold-light">{state.players?.length ?? 0} {state.players?.length === 1 ? 'player' : 'players'} so far</p>
        </Card>
      );
    case 'ready':
      return (
        <Card title={`Question ${state.questionNumber} of ${state.totalQuestions}`}>
          <p className="text-gold-light">{state.roundName}</p>
          <p className="mt-2 text-mute">Eyes on the big screen. The question is coming.</p>
        </Card>
      );
    case 'question':
    case 'locked':
      return <QuestionView state={state} skew={skew} />;
    case 'reveal':
      return <Reveal state={state} />;
    case 'roundEnd':
      return <Card title={`${state.roundName} complete`}>{standings}</Card>;
    case 'finished':
      return (
        <Card title="Final results">
          <Podium rows={state.mode === 'teams' ? teamRows(state, me.teamId) : playerRows(state, me.id)} />
          <Divider className="my-5" />
          <p className="text-center text-lg">You finished <span className="num text-gold-light">#{me.rank}</span> with <span className="num text-gold-light">{me.score}</span> points.</p>
        </Card>
      );
    default:
      return <Card title="Waiting"><Spinner /></Card>;
  }
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Frame className="animate-rise" inner="p-5">
      <h2 className="display mb-3 text-2xl text-gold-light">{title}</h2>
      {children}
    </Frame>
  );
}

function QuestionView({ state, skew }: { state: GameView; skew: number }) {
  const q = state.question!;
  const me = state.me!;
  const live = state.phase === 'question';
  const { timed, fraction, seconds } = useCountdown(state.timer, skew, live);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  // A new question clears local input.
  useEffect(() => { setTyped(''); setPicked(null); setError(''); }, [q.id, state.questionNumber]);

  const mine = picked ?? me.answer;
  const send = async (value: string) => {
    setSending(true);
    setError('');
    setPicked(value);
    navigator.vibrate?.(25);
    try {
      await api('POST', '/api/play/answer', { value }, 'player');
    } catch (err) {
      setPicked(null);
      setError(err instanceof ApiError ? err.message : 'Could not send that.');
    } finally {
      setSending(false);
    }
  };
  const joker = async (on: boolean) => {
    setError('');
    try { await api('POST', '/api/play/joker', { on }, 'player'); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not use the joker.'); }
  };

  return (
    <div className="animate-rise space-y-4">
      {timed && live ? <TimerBar fraction={fraction} seconds={seconds} /> : null}
      <Frame inner="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Chip>{q.category}</Chip>
          {state.options?.showCounter ? <Chip>{state.questionNumber}/{state.totalQuestions}</Chip> : null}
        </div>
        {q.imageUrl ? <img src={q.imageUrl} alt="" className="mb-3 max-h-48 w-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null}
        <h2 className="text-xl font-semibold leading-snug">{q.text}</h2>
      </Frame>

      {!live ? <Notice>Time is up. Your answer {mine ? <>was <strong className="text-cream">{mine}</strong>.</> : 'was not sent.'}</Notice> : null}

      {q.type === 'multiple_choice' ? (
        <div className="grid gap-2.5" role="group" aria-label="Answers">
          {q.options.map((opt, i) => {
            const on = mine === opt;
            return (
              <button
                key={opt} disabled={!live || sending} onClick={() => send(opt)} aria-pressed={on}
                className={`cut flex items-center gap-3 border-0 px-4 py-4 text-left text-lg font-semibold transition disabled:cursor-not-allowed ${on ? 'bg-gradient-to-b from-gold-light to-gold text-ink' : 'bg-panel2 text-cream hover:bg-jade-deep'} ${!live && !on ? 'opacity-50' : ''}`}
                style={{ ['--cut' as string]: '10px', boxShadow: on ? undefined : 'inset 0 0 0 2px rgba(217,180,91,.3)' }}
              >
                <span className={`display grid h-9 w-9 shrink-0 place-items-center text-xl ${on ? 'bg-ink/15' : 'text-gold-light'}`}>{String.fromCharCode(65 + i)}</span>
                <span className="min-w-0 flex-1 break-words">{opt}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) send(typed.trim()); }} className="space-y-3">
          <label className="label" htmlFor="ans">Your answer</label>
          <input id="ans" className="input text-lg" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={200} disabled={!live} autoComplete="off" autoCapitalize="sentences" placeholder="Type your answer" />
          <Button type="submit" size="lg" className="w-full" disabled={!live || sending || !typed.trim()}>{me.answer ? 'Update answer' : 'Send answer'}</Button>
          {me.answer ? <p className="text-center text-sm text-jade-glow">Sent: {me.answer}</p> : null}
        </form>
      )}

      {state.options?.jokers && live ? (
        <button
          onClick={() => joker(!me.jokerArmed)} disabled={me.jokerSpent && !me.jokerArmed}
          aria-pressed={me.jokerArmed}
          className={`w-full border px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition disabled:opacity-40 ${me.jokerArmed ? 'border-gold-light bg-gold/20 text-gold-light' : 'border-gold/30 text-mute hover:border-gold/70'}`}
        >
          {me.jokerSpent && !me.jokerArmed ? 'Joker used' : me.jokerArmed ? 'Joker armed: double points!' : 'Play your joker (x2 points)'}
        </button>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {mine && live && q.type === 'multiple_choice' ? <p className="text-center text-sm text-mute">Answer locked in. You can still change it.</p> : null}
    </div>
  );
}

function Reveal({ state }: { state: GameView }) {
  const q = state.question!;
  const me = state.me!;
  const r = me.result;
  const verdict = !me.answer ? 'No answer' : r?.credit === 1 ? 'Correct!' : r && r.credit > 0 ? 'Partly right' : 'Not quite';
  const tone = !me.answer ? 'text-mute' : r?.credit === 1 ? 'text-jade-glow' : r && r.credit > 0 ? 'text-gold-light' : 'text-ruby';
  const board = useMemo(() => <Standings rows={playerRows(state, me.id)} limit={5} />, [state, me.id]);

  return (
    <div className="animate-rise space-y-4">
      <Frame inner="p-6 text-center">
        <div className={`display text-4xl ${tone}`}>{verdict}</div>
        {r ? <div className="mt-2 text-xl">{r.points > 0 ? `+${r.points} points` : '0 points'}{r.joker ? ' (joker)' : ''}</div> : null}
        {me.answer ? <p className="mt-2 text-sm text-mute">You answered: {me.answer}</p> : null}
      </Frame>
      <Frame inner="p-5">
        <span className="label">Correct answer</span>
        <p className="text-xl font-semibold text-gold-light">{q.answer || 'Marked by the host'}</p>
        {q.explanation ? <p className="mt-2 text-mute">{q.explanation}</p> : null}
      </Frame>
      {board}
    </div>
  );
}
