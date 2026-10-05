import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, hostAction } from '../../lib/api';
import type { GameConfig, SetupInfo } from '../../lib/types';
import { Button, Frame, Notice, Spinner } from '../../ui/Deco';
import { useRun } from './useRun';

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center border border-gold/60 text-transparent transition peer-checked:bg-gold peer-checked:text-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-gold-light" aria-hidden>✓</span>
      <span>
        <span className="font-semibold">{label}</span>
        {hint ? <span className="block text-sm text-mute">{hint}</span> : null}
      </span>
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex border border-gold/40">
      {options.map((o) => (
        <button
          key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          className={`px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] transition ${value === o.id ? 'bg-gold text-ink' : 'text-mute hover:bg-gold/10 hover:text-cream'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Frame inner="p-5">
      <h2 className="display mb-4 text-xl text-gold-light">{title}</h2>
      <div className="space-y-4">{children}</div>
    </Frame>
  );
}

function NumberField({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; hint?: string }) {
  const id = `n-${label.replace(/\W+/g, '-')}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input w-32" type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint ? <p className="mt-1 text-xs text-mute">{hint}</p> : null}
    </div>
  );
}

export function Setup() {
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [cfg, setCfg] = useState<GameConfig | null>(null);
  const { busy, error, run } = useRun();
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api<SetupInfo>('GET', '/api/setup', undefined, 'host')
      .then((s) => { setInfo(s); setCfg({ ...s.defaults, ...(s.last ?? {}) }); })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const set = <K extends keyof GameConfig>(key: K, value: GameConfig[K]) => setCfg((c) => (c ? { ...c, [key]: value } : c));

  const available = useMemo(() => {
    if (!info || !cfg) return 0;
    const picked = cfg.categories.length ? info.categories.filter((c) => cfg.categories.includes(c.category)) : info.categories;
    const total = picked.reduce((n, c) => n + c.count, 0);
    if (cfg.roundMode === 'category') return picked.reduce((n, c) => n + (cfg.questionCount ? Math.min(c.count, cfg.questionCount) : c.count), 0);
    return cfg.questionCount ? Math.min(total, cfg.questionCount) : total;
  }, [info, cfg]);

  if (loadError) return <Notice tone="error">{loadError}</Notice>;
  if (!info || !cfg) return <div className="grid place-items-center py-24"><Spinner label="Loading" /></div>;

  const toggleCategory = (name: string) => set('categories', cfg.categories.includes(name) ? cfg.categories.filter((c) => c !== name) : [...cfg.categories, name]);
  const open = () => run(() => hostAction('open', { config: cfg }));

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5">
        <Section title="Game">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input id="title" className="input" value={cfg.title} maxLength={60} onChange={(e) => set('title', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="subtitle">Subtitle</label>
              <input id="subtitle" className="input" value={cfg.subtitle} maxLength={100} onChange={(e) => set('subtitle', e.target.value)} />
            </div>
          </div>
          <div>
            <span className="label">Play as</span>
            <Segmented label="Play as" value={cfg.mode} onChange={(v) => set('mode', v)} options={[{ id: 'individual', label: 'Individuals' }, { id: 'teams', label: 'Teams' }]} />
          </div>
          {cfg.mode === 'teams' ? (
            <div className="grid gap-4 border-l-2 border-gold/40 pl-4 sm:grid-cols-3">
              <NumberField label="Teams" value={cfg.teamCount} min={2} max={8} onChange={(n) => set('teamCount', n)} />
              <div>
                <span className="label">Joining</span>
                <Segmented label="Team assignment" value={cfg.teamAssign} onChange={(v) => set('teamAssign', v)} options={[{ id: 'choose', label: 'Choose' }, { id: 'auto', label: 'Auto-balance' }]} />
              </div>
              <div>
                <span className="label">Team score</span>
                <Segmented label="Team scoring" value={cfg.teamScoring} onChange={(v) => set('teamScoring', v)} options={[{ id: 'average', label: 'Average' }, { id: 'sum', label: 'Total' }]} />
                <p className="mt-1 text-xs text-mute">Average keeps uneven teams fair.</p>
              </div>
            </div>
          ) : null}
        </Section>

        <Section title="Questions">
          <div>
            <span className="label">Categories {cfg.categories.length ? '' : '(all)'}</span>
            <div className="flex flex-wrap gap-2">
              {info.categories.map((c) => {
                const on = cfg.categories.includes(c.category);
                return (
                  <button key={c.category} type="button" aria-pressed={on} onClick={() => toggleCategory(c.category)}
                    className={`border px-3 py-1.5 text-sm font-semibold transition ${on ? 'border-gold-light bg-gold text-ink' : 'border-gold/30 text-cream hover:border-gold'}`}>
                    {c.category} <span className={on ? 'text-ink/70' : 'text-mute'}>{c.count}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-mute">Pick none to use every category.</p>
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <NumberField label="How many" value={cfg.questionCount} min={0} max={500} onChange={(n) => set('questionCount', n)} hint="0 means all matching" />
            <div>
              <span className="label">Rounds</span>
              <Segmented label="Rounds" value={cfg.roundMode} onChange={(v) => set('roundMode', v)} options={[{ id: 'single', label: 'One' }, { id: 'size', label: 'By size' }, { id: 'category', label: 'By category' }]} />
            </div>
            {cfg.roundMode === 'size' ? <NumberField label="Per round" value={cfg.roundSize} min={1} max={100} onChange={(n) => set('roundSize', n)} /> : null}
          </div>
          <div className="grid gap-x-8 sm:grid-cols-2">
            <Toggle label="Shuffle questions" checked={cfg.shuffleQuestions} onChange={(v) => set('shuffleQuestions', v)} />
            <Toggle label="Shuffle answer options" checked={cfg.shuffleOptions} onChange={(v) => set('shuffleOptions', v)} />
          </div>
        </Section>

        <Section title="Scoring and timing">
          <div className="flex flex-wrap gap-6">
            <NumberField label="Points per question" value={cfg.pointsPerQuestion} min={1} max={1000} onChange={(n) => set('pointsPerQuestion', n)} />
            {cfg.timed ? <NumberField label="Seconds per question" value={cfg.timeLimit} min={5} max={300} onChange={(n) => set('timeLimit', n)} /> : null}
          </div>
          <div className="grid gap-x-8 sm:grid-cols-2">
            <Toggle label="Timed questions" hint="Answers lock when the clock runs out." checked={cfg.timed} onChange={(v) => set('timed', v)} />
            <Toggle label="Speed bonus" hint="Up to +50% for answering fast. Needs a timer." checked={cfg.speedBonus && cfg.timed} onChange={(v) => set('speedBonus', v)} />
            <Toggle label="Jokers" hint="Each player can double the points of one question." checked={cfg.jokers} onChange={(v) => set('jokers', v)} />
            <Toggle label="Sound on the big screen" hint="Countdown ticks, buzzer, reveal chime, fanfare." checked={cfg.audio} onChange={(v) => set('audio', v)} />
            <Toggle label="Show question counter" checked={cfg.showCounter} onChange={(v) => set('showCounter', v)} />
          </div>
        </Section>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Frame inner="p-5" tone="jade">
          <h2 className="display text-xl text-gold-light">Ready?</h2>
          <p className="mt-3 text-lg"><span className="num text-3xl text-gold-light">{available}</span> {available === 1 ? 'question' : 'questions'}</p>
          <p className="mt-1 text-sm text-mute">
            {cfg.mode === 'teams' ? `${cfg.teamCount} teams` : 'Individual play'}
            {cfg.timed ? `, ${cfg.timeLimit}s each` : ', untimed'}
          </p>
          {available === 0 ? <div className="mt-4"><Notice tone="error">No questions match. Add some in the Questions tab or change the categories.</Notice></div> : null}
          {error ? <div className="mt-4"><Notice tone="error">{error}</Notice></div> : null}
          <Button size="lg" className="mt-5 w-full" disabled={busy || available === 0} onClick={open}>{busy ? 'Opening…' : 'Open the lobby'}</Button>
          <p className="mt-3 text-xs text-mute">Players can join as soon as the lobby opens. You start the game when everyone is in.</p>
        </Frame>
      </aside>
    </div>
  );
}
