import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { joinUrl } from '../lib/joinUrl';
import { sfx } from '../lib/sfx';
import { useCountdown } from '../lib/useCountdown';
import { useGame } from '../lib/useGame';
import type { GameView, ServerInfo } from '../lib/types';
import { Chip, Diamond, Logo, Spinner } from '../ui/Deco';
import { Podium } from '../ui/Podium';
import { QR } from '../ui/QR';
import { Standings } from '../ui/Standings';
import { playerRows, teamRows } from '../ui/standingRows';
import { TimerBar } from '../ui/TimerBar';

export function BigScreen() {
  const { state, link, skew } = useGame('screen');
  const [info, setInfo] = useState<ServerInfo | null>(null);
  useEffect(() => { api<ServerInfo>('GET', '/api/info').then(setInfo).catch(() => undefined); }, []);
  useWakeLock();
  const audio = useSounds(state, skew);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-ink">
      <div className="rays pointer-events-none absolute inset-x-0 bottom-0 h-[80vh]" aria-hidden />
      <div className="rays-top pointer-events-none absolute inset-x-0 top-0 h-[40vh] opacity-60" aria-hidden />
      <div className="relative h-full">
        {!state ? <Center><Spinner label={link === 'reconnecting' ? 'Reconnecting' : 'Connecting'} /></Center> : <Stage state={state} skew={skew} info={info} />}
      </div>
      <Controls audio={audio} />
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full place-items-center">{children}</div>;
}

function Stage({ state, skew, info }: { state: GameView; skew: number; info: ServerInfo | null }) {
  const showBoard = state.showLeaderboard && ['lobby', 'ready', 'reveal'].includes(state.phase);
  if (showBoard) return <Board state={state} title="Leaderboard" />;

  switch (state.phase) {
    case 'idle':
      return (
        <Center>
          <div className="text-center">
            <Logo size="screen" />
            <p className="mt-[3vh] animate-shimmer text-[2vw] uppercase tracking-[0.4em] text-gold-light">Waiting for the host</p>
          </div>
        </Center>
      );
    case 'lobby':
      return <Lobby state={state} info={info} />;
    case 'ready':
      return <Ready state={state} />;
    case 'question':
    case 'locked':
    case 'reveal':
      return <QuestionStage state={state} skew={skew} />;
    case 'roundEnd':
      return <Board state={state} title={`${state.roundName} complete`} />;
    case 'finished':
      return <Finale state={state} />;
    default:
      return null;
  }
}

// ---------- lobby ----------

function Lobby({ state, info }: { state: GameView; info: ServerInfo | null }) {
  const url = joinUrl(info, state.joinCode);
  const players = state.players ?? [];
  const teams = state.teams ?? [];
  return (
    <div className="grid h-full grid-cols-[1.25fr_1fr] items-center gap-[4vw] px-[5vw]">
      <div className="min-w-0">
        <div className="display gold-text text-[6.5vw] leading-[1.05]">{state.title}</div>
        <p className="mt-[1.5vh] text-[2vw] text-gold-light">{state.subtitle}</p>
        <div className="mt-[4vh]">
          <div className="mb-[1.5vh] flex items-center gap-[1vw] text-[1.4vw] uppercase tracking-[0.3em] text-mute">
            <Diamond /> {players.length} {players.length === 1 ? 'player' : 'players'} in
          </div>
          {state.mode === 'teams' ? (
            <div className="grid grid-cols-3 gap-[1.2vw]">
              {teams.map((t) => (
                <div key={t.id} className="border border-gold/25 bg-panel/70 p-[1vw]">
                  <div className="mb-[0.8vh] flex items-center gap-[0.6vw] text-[1.6vw] font-semibold"><span className="h-[0.9vw] w-[0.9vw] rotate-45" style={{ background: t.color }} />{t.name}</div>
                  <div className="flex flex-wrap gap-[0.5vw]">
                    {players.filter((p) => p.teamId === t.id).map((p) => <NameChip key={p.id} name={p.name} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex max-h-[44vh] flex-wrap gap-[0.7vw] overflow-hidden">
              {players.map((p) => <NameChip key={p.id} name={p.name} />)}
              {!players.length ? <span className="text-[1.8vw] text-mute">Scan the code to join.</span> : null}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col items-center">
        <div className="cut bg-gradient-to-br from-gold-light via-gold to-gold-dark p-[0.5vw]" style={{ ['--cut' as string]: '1.6vw' }}>
          <QR value={url} size={Math.round(window.innerHeight * 0.4)} className="block" />
        </div>
        <p className="mt-[2.5vh] text-[1.5vw] uppercase tracking-[0.3em] text-mute">Scan to play</p>
        <p className="mt-[0.5vh] max-w-full break-all text-center text-[1.6vw] text-gold-light">{url.replace(/^https?:\/\//, '').replace(/\?code=.*/, '')}</p>
        {info?.codeRequired && state.joinCode ? (
          <p className="display mt-[1.5vh] text-[4vw] tracking-[0.3em] text-gold-light">{state.joinCode}</p>
        ) : null}
      </div>
    </div>
  );
}

function NameChip({ name }: { name: string }) {
  return <span className="animate-pop border border-gold/40 bg-jade-deep/60 px-[1vw] py-[0.5vh] text-[1.7vw] font-semibold">{name}</span>;
}

// ---------- ready ----------

function Ready({ state }: { state: GameView }) {
  const indexInRound = (state.questionIndex ?? 0) + 1;
  const roundTotal = state.rounds?.[state.roundIndex ?? 0]?.questions ?? 0;
  return (
    <Center>
      <div key={state.questionNumber} className="animate-pop text-center">
        <div className="text-[2vw] uppercase tracking-[0.45em] text-gold-light">{state.roundName}</div>
        <div className="num gold-text mt-[2vh] text-[15vw] leading-none">{state.questionNumber}</div>
        <div className="mt-[2vh] text-[2.4vw] uppercase tracking-[0.35em] text-cream">
          {state.options?.showCounter ? `Question ${indexInRound} of ${roundTotal}` : 'Get ready'}
        </div>
        {state.options?.timed ? <div className="mt-[1vh] text-[1.6vw] uppercase tracking-[0.3em] text-mute">{state.config?.timeLimit ?? ''}</div> : null}
      </div>
    </Center>
  );
}

// ---------- questions ----------

function QuestionStage({ state, skew }: { state: GameView; skew: number }) {
  const q = state.question!;
  const revealed = state.phase === 'reveal';
  const locked = state.phase === 'locked';
  const live = state.phase === 'question';
  const { timed, fraction, seconds } = useCountdown(state.timer, skew, live);
  const textSize = q.text.length < 60 ? 'text-[5.2vw]' : q.text.length < 120 ? 'text-[4.2vw]' : 'text-[3.4vw]';
  const counts = state.optionCounts ?? {};
  const totalPicks = Object.values(counts).reduce((a, b) => a + b, 0);
  const awarded = (state.results ?? []).filter((r) => r.credit > 0);

  return (
    <div className="flex h-full flex-col px-[4.5vw] py-[3vh]">
      <header className="flex items-center gap-[1.2vw]">
        <Chip className="!px-[1.2vw] !py-[0.6vh] !text-[1.3vw]">{q.category}</Chip>
        {state.options?.showCounter ? <Chip className="!px-[1.2vw] !py-[0.6vh] !text-[1.3vw]">Question {state.questionNumber} of {state.totalQuestions}</Chip> : null}
        <div className="flex-1" />
        <span className="text-[1.4vw] uppercase tracking-[0.25em] text-mute">
          {state.answeredCount ?? 0} of {state.connectedCount ?? 0} answered
        </span>
      </header>

      {timed && (live || locked) ? <div className="mt-[2vh]"><TimerBar fraction={fraction} seconds={seconds} big /></div> : <div className="mt-[2vh] h-[3vh]" />}

      <main className="mt-[2.5vh] grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-[3.5vh]">
        <div className={`grid items-center gap-[3vw] ${q.imageUrl ? 'grid-cols-[1.4fr_1fr]' : 'grid-cols-1'}`}>
          <h1 key={q.id} className={`animate-rise font-semibold leading-[1.15] ${textSize}`}>{q.text}</h1>
          {q.imageUrl ? <img src={q.imageUrl} alt="" className="max-h-[28vh] w-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null}
        </div>

        {q.type === 'multiple_choice' ? (
          <div className="grid h-full min-h-0 auto-rows-fr grid-cols-2 gap-[1.6vw]">
            {q.options.map((opt, i) => {
              const correct = revealed && opt === q.answer;
              const dim = revealed && !correct;
              const picks = counts[opt] ?? 0;
              return (
                <div
                  key={opt}
                  className={`cut relative flex items-center gap-[1.4vw] overflow-hidden px-[1.6vw] transition duration-500 ${correct ? 'bg-gradient-to-b from-gold-light to-gold text-ink' : 'bg-panel2 text-cream'} ${dim ? 'opacity-40' : ''} ${locked ? 'opacity-80' : ''}`}
                  style={{ ['--cut' as string]: '1.2vw', boxShadow: correct ? undefined : 'inset 0 0 0 0.18vw rgba(217,180,91,.35)' }}
                >
                  {revealed && totalPicks > 0 ? <span className="absolute inset-y-0 left-0 bg-gold/20" style={{ width: `${(picks / totalPicks) * 100}%` }} aria-hidden /> : null}
                  <span className={`display relative grid w-[4vw] place-items-center text-[3.2vw] ${correct ? 'text-ink' : 'text-gold-light'}`}>{String.fromCharCode(65 + i)}</span>
                  <span className="relative min-w-0 flex-1 break-words text-[2.6vw] font-semibold leading-tight">{opt}</span>
                  {revealed ? <span className="num relative text-[2.6vw]">{picks}</span> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-0 flex-col items-center justify-center text-center">
            {!revealed ? (
              <p className="text-[2.6vw] text-gold-light">Type your answer on your phone</p>
            ) : (
              <>
                {q.answer ? <div className="cut bg-gradient-to-b from-gold-light to-gold px-[3vw] py-[2vh] text-[4vw] font-semibold text-ink" style={{ ['--cut' as string]: '1.4vw' }}>{q.answer}</div> : null}
                <div className="mt-[2.5vh] flex max-h-[26vh] flex-wrap justify-center gap-[1vw] overflow-hidden">
                  {awarded.map((r) => (
                    <div key={r.playerId} className="animate-pop border border-gold/40 bg-jade-deep/70 px-[1.2vw] py-[0.8vh] text-[1.8vw]">
                      <span className="font-semibold">{r.name}</span>: {r.answer} <span className="num text-gold-light">+{r.points}</span>
                    </div>
                  ))}
                  {!awarded.length ? <span className="text-[1.8vw] text-mute">No answers earned points.</span> : null}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {locked ? (
        <div className="pointer-events-none absolute inset-x-0 top-[44%] z-10 animate-pop text-center">
          <span className="display bg-ink/85 px-[4vw] py-[1.5vh] text-[7vw] text-ruby">TIME&rsquo;S UP</span>
        </div>
      ) : null}
      {revealed && q.explanation ? (
        <footer className="mt-[2vh] animate-rise border-t border-gold/30 pt-[1.5vh] text-center text-[1.7vw] text-mute">{q.explanation}</footer>
      ) : null}
    </div>
  );
}

// ---------- standings and finale ----------

function Board({ state, title }: { state: GameView; title: string }) {
  const teams = state.mode === 'teams';
  return (
    <div className="mx-auto flex h-full max-w-[72vw] flex-col justify-center py-[4vh]">
      <h1 className="display gold-text mb-[3vh] text-center text-[5vw] leading-none">{title}</h1>
      <div className={`grid gap-[2.5vw] ${teams ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {teams ? <div><div className="mb-[1.5vh] text-center text-[1.5vw] uppercase tracking-[0.3em] text-mute">Teams</div><Standings rows={teamRows(state)} size="lg" /></div> : null}
        <div>
          {teams ? <div className="mb-[1.5vh] text-center text-[1.5vw] uppercase tracking-[0.3em] text-mute">Players</div> : null}
          <Standings rows={playerRows(state)} limit={teams ? 6 : 8} size="lg" />
        </div>
      </div>
    </div>
  );
}

function Finale({ state }: { state: GameView }) {
  const teams = state.mode === 'teams';
  const confetti = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i * 0.37) % 6, size: 0.6 + ((i * 13) % 7) / 7, hue: ['#d9b45b', '#f1d98f', '#2fbf8f', '#d8454f', '#f3ead3'][i % 5],
  })), []);
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-[6vw]">
      {confetti.map((c, i) => (
        <span key={i} className="absolute top-0 rotate-45 animate-fall" style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, width: `${c.size}vw`, height: `${c.size}vw`, background: c.hue }} aria-hidden />
      ))}
      <h1 className="display gold-text relative text-[6vw] leading-none">{teams ? 'Winning team' : 'Champions'}</h1>
      <div className="relative mt-[4vh] w-full max-w-[70vw]">
        <Podium rows={teams ? teamRows(state) : playerRows(state)} size="lg" />
      </div>
      {teams ? (
        <div className="relative mt-[3vh] flex flex-wrap justify-center gap-[1.2vw] text-[1.6vw] text-mute">
          {playerRows(state).slice(0, 3).map((p) => <span key={p.id}>#{p.rank} {p.name} ({p.score})</span>)}
        </div>
      ) : null}
    </div>
  );
}

// ---------- sound, wake lock, controls ----------

function useSounds(state: GameView | null, skew: number) {
  const [ready, setReady] = useState(sfx.ready);
  const [muted, setMuted] = useState(sfx.muted);
  const prev = useRef<{ phase?: string; q?: number; players?: number; second?: number }>({});
  const allowed = state?.options?.audio !== false;

  useEffect(() => {
    if (!state || !allowed) return;
    const p = prev.current;
    if (p.phase !== undefined) {
      if (state.phase !== p.phase || (state.phase === 'question' && state.questionNumber !== p.q)) {
        if (state.phase === 'question') sfx.start();
        else if (state.phase === 'locked') sfx.buzz();
        else if (state.phase === 'reveal') sfx.chime();
        else if (state.phase === 'finished') sfx.fanfare();
      }
      if (state.phase === 'lobby' && (state.players?.length ?? 0) > (p.players ?? 0)) sfx.join();
    }
    prev.current = { ...p, phase: state.phase, q: state.questionNumber, players: state.players?.length ?? 0 };
  }, [state, allowed]);

  // Countdown ticks in the last five seconds.
  useEffect(() => {
    if (!state || state.phase !== 'question' || !state.timer?.endsAt || !allowed) return;
    const endsAt = state.timer.endsAt;
    const id = setInterval(() => {
      const left = Math.ceil((endsAt - (Date.now() + skew)) / 1000);
      if (left > 0 && left <= 5 && prev.current.second !== left) {
        prev.current.second = left;
        if (left <= 3) sfx.urgent(); else sfx.tick();
      }
    }, 200);
    return () => clearInterval(id);
  }, [state?.phase, state?.timer?.endsAt, skew, allowed, state]);

  return {
    ready, muted,
    unlock: async () => { setReady(await sfx.unlock()); },
    toggleMute: () => { sfx.setMuted(!sfx.muted); setMuted(sfx.muted); },
    allowed,
  };
}

function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const ask = async () => {
      try { lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* not allowed */ }
    };
    ask();
    const onVisible = () => { if (document.visibilityState === 'visible') ask(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release().catch(() => undefined); };
  }, []);
}

function Controls({ audio }: { audio: ReturnType<typeof useSounds> }) {
  const [full, setFull] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const on = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined);
  const btn = 'border border-gold/40 bg-ink/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-gold-light hover:bg-gold/15';
  return (
    <div className={`absolute bottom-3 right-3 z-20 flex gap-2 transition hover:opacity-100 focus-within:opacity-100 ${audio.allowed && !audio.ready ? '' : 'opacity-30'}`}>
      {audio.allowed ? (
        audio.ready ? (
          <button className={btn} onClick={audio.toggleMute}>{audio.muted ? 'Sound off' : 'Sound on'}</button>
        ) : (
          <button className={`${btn} animate-shimmer`} onClick={audio.unlock}>Tap to enable sound</button>
        )
      ) : null}
      <button className={btn} onClick={toggleFull}>{full ? 'Exit full screen' : 'Full screen'}</button>
    </div>
  );
}
