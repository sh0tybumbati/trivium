import { useState, type ReactNode } from 'react';
import { hostAction } from '../../lib/api';
import { joinUrl } from '../../lib/joinUrl';
import { useCountdown } from '../../lib/useCountdown';
import type { GameView, ServerInfo, SubmissionRow } from '../../lib/types';
import { Button, Chip, Frame, Notice } from '../../ui/Deco';
import { QR } from '../../ui/QR';
import { Standings } from '../../ui/Standings';
import { playerRows, teamRows } from '../../ui/standingRows';
import { TimerBar } from '../../ui/TimerBar';
import { useRun } from './useRun';

const PHASE_LABEL: Record<string, string> = {
  lobby: 'Lobby open', ready: 'Get ready', question: 'Question live', locked: 'Answers locked',
  reveal: 'Answer revealed', roundEnd: 'Round complete', finished: 'Game finished',
};

export function Live({ state, skew, info }: { state: GameView; skew: number; info: ServerInfo | null }) {
  const { busy, error, run } = useRun();
  const act = (action: string, body: Record<string, unknown> = {}) => run(() => hostAction(action, body));
  const [confirmEnd, setConfirmEnd] = useState(false);

  const phase = state.phase;
  const round = state.rounds?.[state.roundIndex ?? 0];
  const lastInRound = round ? (state.questionIndex ?? 0) + 1 >= round.questions : false;
  const lastRound = (state.roundIndex ?? 0) + 1 >= (state.rounds?.length ?? 1);
  const live = phase === 'question';
  const { timed, fraction, seconds } = useCountdown(state.timer, skew, live);

  const primary = (() => {
    switch (phase) {
      case 'lobby': return { label: 'Start game', action: 'start' };
      case 'ready': return { label: 'Show question', action: 'show' };
      case 'question': return { label: 'Lock answers', action: 'lock' };
      case 'locked': return { label: 'Reveal answer', action: 'reveal' };
      case 'reveal': return { label: !lastInRound ? 'Next question' : !lastRound ? 'Finish round' : 'Final results', action: 'next' };
      case 'roundEnd': return { label: 'Start next round', action: 'next' };
      case 'finished': return { label: 'Close game', action: 'close' };
      default: return null;
    }
  })();

  const canBoard = ['lobby', 'ready', 'reveal', 'roundEnd'].includes(phase);
  const canSkip = ['ready', 'question', 'locked'].includes(phase);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="min-w-0 space-y-5">
        <Frame inner="p-5" tone="jade">
          <div className="flex flex-wrap items-center gap-3">
            <Chip className="!text-gold-light">{PHASE_LABEL[phase] ?? phase}</Chip>
            {phase !== 'lobby' && phase !== 'finished' ? (
              <span className="text-sm uppercase tracking-[0.16em] text-mute">
                {state.roundName} &middot; Question {state.questionNumber} of {state.totalQuestions}
              </span>
            ) : null}
            <span className="ml-auto text-sm text-mute">{state.title}</span>
          </div>

          {timed && live ? <div className="mt-4"><TimerBar fraction={fraction} seconds={seconds} /></div> : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {primary ? <Button size="lg" disabled={busy} onClick={() => act(primary.action)}>{primary.label}</Button> : null}
            {phase === 'question' ? <Button variant="ghost" disabled={busy} onClick={() => act('reveal')}>Reveal now</Button> : null}
            {phase === 'question' && timed ? <Button variant="ghost" disabled={busy} onClick={() => act('addTime', { seconds: 10 })}>+10 seconds</Button> : null}
            {canSkip ? <Button variant="ghost" disabled={busy} onClick={() => act('skip')}>Skip question</Button> : null}
            {canBoard ? <Button variant="ghost" disabled={busy} onClick={() => act('leaderboard')}>{state.showLeaderboard ? 'Hide leaderboard' : 'Show leaderboard'}</Button> : null}
            <span className="flex-1" />
            {phase !== 'finished' ? (
              confirmEnd ? (
                <span className="flex items-center gap-2">
                  <span className="text-sm text-mute">End the game and save it?</span>
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => { setConfirmEnd(false); void act('end'); }}>End game</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmEnd(false)}>Keep playing</Button>
                </span>
              ) : <Button size="sm" variant="ghost" onClick={() => setConfirmEnd(true)}>End game…</Button>
            ) : null}
          </div>
          {error ? <div className="mt-4"><Notice tone="error">{error}</Notice></div> : null}
          {phase === 'finished' && state.savedGameId ? <p className="mt-4 text-sm text-jade-glow">Saved to History.</p> : null}
          {phase === 'finished' && !state.savedGameId ? <p className="mt-4 text-sm text-mute">Nothing to save: no questions were answered.</p> : null}
        </Frame>

        {state.question ? <QuestionPreview state={state} /> : null}
        {state.question && ['question', 'locked', 'reveal'].includes(phase) ? <Submissions state={state} act={act} busy={busy} /> : null}
        {phase === 'roundEnd' || phase === 'finished' ? (
          <Frame inner="p-5">
            <h2 className="display mb-3 text-xl text-gold-light">{phase === 'finished' ? 'Final standings' : `${state.roundName} standings`}</h2>
            <Standings rows={state.mode === 'teams' ? teamRows(state) : playerRows(state)} />
          </Frame>
        ) : null}
      </div>

      <aside className="space-y-5">
        <JoinCard state={state} info={info} />
        <Roster state={state} act={act} />
        {phase !== 'lobby' ? (
          <Frame inner="p-4">
            <h2 className="display mb-3 text-lg text-gold-light">Standings</h2>
            <Standings rows={state.mode === 'teams' ? teamRows(state) : playerRows(state)} limit={6} />
          </Frame>
        ) : null}
      </aside>
    </div>
  );
}

function QuestionPreview({ state }: { state: GameView }) {
  const q = state.question!;
  const counts = state.optionCounts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const secret = state.phase === 'ready';
  return (
    <Frame inner="p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Chip>{q.category}</Chip>
        <Chip>{q.type === 'write_in' ? 'Write-in' : 'Multiple choice'}</Chip>
        {secret ? <span className="text-xs uppercase tracking-[0.16em] text-mute">Preview (hidden from players)</span> : null}
      </div>
      <h2 className="text-2xl font-semibold leading-snug">{q.text}</h2>
      {q.imageUrl ? <img src={q.imageUrl} alt="" className="mt-3 max-h-40 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null}
      {q.type === 'multiple_choice' ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {q.options.map((opt, i) => {
            const correct = opt === q.answer;
            const n = counts[opt] ?? 0;
            return (
              <li key={opt} className={`relative flex items-center gap-3 overflow-hidden border px-3 py-2.5 ${correct ? 'border-gold-light bg-gold/15' : 'border-gold/20'}`}>
                {total > 0 ? <span className="absolute inset-y-0 left-0 bg-gold/15 transition-[width] duration-500" style={{ width: `${(n / total) * 100}%` }} aria-hidden /> : null}
                <span className="display relative w-6 text-gold-light">{String.fromCharCode(65 + i)}</span>
                <span className="relative flex-1">{opt}</span>
                {correct ? <span className="relative text-xs font-bold uppercase tracking-[0.16em] text-gold-light">Correct</span> : null}
                {total > 0 ? <span className="num relative text-mute">{n}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-lg">Answer: <strong className="text-gold-light">{q.answer || 'You decide, there is no stored answer.'}</strong></p>
      )}
      {q.explanation ? <p className="mt-4 border-t border-gold/20 pt-3 text-mute">{q.explanation}</p> : null}
    </Frame>
  );
}

function Submissions({ state, act, busy }: { state: GameView; act: (a: string, b?: Record<string, unknown>) => Promise<unknown>; busy: boolean }) {
  const subs = state.submissions ?? [];
  const writeIn = state.question?.type === 'write_in';
  const reveal = state.phase === 'reveal';
  const missing = (state.roster ?? []).filter((p) => !subs.some((s) => s.playerId === p.id));
  return (
    <Frame inner="p-5">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="display text-xl text-gold-light">Answers</h2>
        <span className="text-sm text-mute">{subs.length} of {state.roster?.length ?? 0}</span>
        {writeIn && reveal ? <span className="ml-auto text-xs uppercase tracking-[0.16em] text-mute">Click to award: none, half or full</span> : null}
      </div>
      {!subs.length ? <p className="text-mute">No answers yet.</p> : (
        <ul className="divide-y divide-gold/15">
          {subs.map((s) => <SubmissionRowView key={s.playerId} s={s} writeIn={writeIn} reveal={reveal} busy={busy} act={act} />)}
        </ul>
      )}
      {missing.length && state.phase !== 'ready' ? <p className="mt-3 text-sm text-mute">Waiting on: {missing.map((m) => m.name).join(', ')}</p> : null}
    </Frame>
  );
}

function SubmissionRowView({ s, writeIn, reveal, busy, act }: { s: SubmissionRow; writeIn: boolean; reveal: boolean; busy: boolean; act: (a: string, b?: Record<string, unknown>) => Promise<unknown> }) {
  const credit = s.credit;
  const mark = (c: number, label: string, on: boolean) => (
    <button
      key={c} disabled={busy} onClick={() => act('grade', { playerId: s.playerId, credit: c })} aria-pressed={on}
      className={`min-w-[2.6rem] border px-2.5 py-1 text-sm font-bold transition disabled:opacity-40 ${on ? 'border-gold-light bg-gold text-ink' : 'border-gold/30 text-mute hover:border-gold hover:text-cream'}`}
    >{label}</button>
  );
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
      <span className="w-32 truncate font-semibold">{s.name}</span>
      <span className="min-w-0 flex-1 break-words">{s.answer}{s.joker ? <span className="ml-2 text-xs font-bold uppercase tracking-[0.14em] text-gold-light">Joker</span> : null}</span>
      {reveal && credit !== null ? (
        <>
          <span className={`num w-14 text-right ${credit > 0 ? 'text-jade-glow' : 'text-ruby'}`}>{s.points}</span>
          {writeIn ? <span className="flex gap-1">{mark(0, '✗', credit === 0)}{mark(0.5, '½', credit === 0.5)}{mark(1, '✓', credit === 1)}</span> : <span className={`w-6 text-center font-bold ${credit > 0 ? 'text-jade-glow' : 'text-ruby'}`}>{credit > 0 ? '✓' : '✗'}</span>}
        </>
      ) : null}
    </li>
  );
}

function JoinCard({ state, info }: { state: GameView; info: ServerInfo | null }) {
  const url = joinUrl(info, state.joinCode);
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => undefined); };
  return (
    <Frame inner="p-4 text-center">
      <div className="flex justify-center"><QR value={url} size={150} /></div>
      <p className="mt-3 break-all text-sm text-gold-light">{url.replace(/^https?:\/\//, '')}</p>
      {info?.codeRequired ? <p className="display mt-1 text-2xl tracking-[0.3em] text-gold-light">{state.joinCode}</p> : null}
      <Button size="sm" variant="ghost" className="mt-3" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button>
    </Frame>
  );
}

function Roster({ state, act }: { state: GameView; act: (a: string, b?: Record<string, unknown>) => Promise<unknown> }) {
  const roster = state.roster ?? [];
  const teams = state.teams ?? [];
  const row = (id: string): ReactNode => {
    const p = roster.find((r) => r.id === id)!;
    return (
      <li key={p.id} className="flex items-center gap-2 py-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? 'bg-jade-glow' : 'bg-mute/50'}`} title={p.connected ? 'Connected' : 'Disconnected'} />
        <span className="min-w-0 flex-1 truncate">{p.name}{p.jokerSpent ? <span className="ml-1 text-xs text-mute" title="Joker used">★</span> : null}</span>
        {teams.length ? (
          <select aria-label={`Team for ${p.name}`} className="max-w-[6.5rem] border border-gold/30 bg-ink px-1 py-0.5 text-xs" value={p.teamId ?? ''} onChange={(e) => act('move', { playerId: p.id, teamId: e.target.value })}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        ) : null}
        <button className="px-1.5 text-mute hover:text-ruby" aria-label={`Remove ${p.name}`} onClick={() => { if (window.confirm(`Remove ${p.name} from the game?`)) void act('kick', { playerId: p.id }); }}>✕</button>
      </li>
    );
  };
  return (
    <Frame inner="p-4">
      <h2 className="display mb-2 text-lg text-gold-light">Players <span className="text-mute">({roster.length})</span></h2>
      {roster.length ? <ul className="max-h-80 divide-y divide-gold/10 overflow-y-auto">{roster.map((p) => row(p.id))}</ul> : <p className="text-sm text-mute">Nobody yet. Share the QR code.</p>}
    </Frame>
  );
}
