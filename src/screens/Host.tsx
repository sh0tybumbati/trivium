import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { KEYS, store } from '../lib/storage';
import { useGame, type Link } from '../lib/useGame';
import type { ServerInfo } from '../lib/types';
import { Button, Frame, Logo, Notice, Spinner } from '../ui/Deco';
import { History } from './host/History';
import { Live } from './host/Live';
import { QuestionBank } from './host/QuestionBank';
import { Settings } from './host/Settings';
import { Setup } from './host/Setup';

type Tab = 'game' | 'questions' | 'history' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'game', label: 'Game' },
  { id: 'questions', label: 'Questions' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
];

export function Host() {
  const [token, setToken] = useState(() => store.get(KEYS.host));
  if (!token) return <SignIn onToken={(t) => { store.set(KEYS.host, t); setToken(t); }} />;
  return <Console token={token} onToken={(t) => { store.set(KEYS.host, t); setToken(t); }} onSignOut={() => { store.remove(KEYS.host); setToken(null); }} />;
}

// ---------- sign in ----------

function SignIn({ onToken }: { onToken: (token: string) => void }) {
  const [pin, setPin] = useState('');
  const [needPin, setNeedPin] = useState(false);
  const [error, setError] = useState('');
  const [trying, setTrying] = useState(true);

  const login = async (value?: string) => {
    try {
      const out = await api<{ token: string }>('POST', '/api/host/login', { pin: value });
      onToken(out.token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { setNeedPin(true); if (value) setError(err.message); }
      else setError(err instanceof ApiError ? err.message : 'Could not sign in.');
      setTrying(false);
    }
  };

  // On the host machine with no PIN set this signs in silently.
  useEffect(() => { void login(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); void login(pin); };

  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-sm text-center">
        <Logo size="md" />
        <Frame className="mt-8 text-left" inner="p-6">
          {trying ? <div className="flex justify-center py-6"><Spinner label="Signing in" /></div> : (
            <form onSubmit={submit} className="space-y-4">
              <h1 className="display text-2xl text-gold-light">Host sign-in</h1>
              {needPin ? (
                <div>
                  <label className="label" htmlFor="pin">Host PIN</label>
                  <input id="pin" className="input text-xl tracking-[0.4em]" type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} />
                </div>
              ) : null}
              {error ? <Notice tone="error">{error}</Notice> : null}
              {needPin ? <Button type="submit" className="w-full" disabled={!pin}>Sign in</Button> : <Button className="w-full" onClick={() => { setTrying(true); setError(''); void login(); }}>Try again</Button>}
            </form>
          )}
        </Frame>
      </div>
    </main>
  );
}

// ---------- console ----------

function Console({ token, onSignOut, onToken }: { token: string; onSignOut: () => void; onToken: (token: string) => void }) {
  const { state, link, skew } = useGame('host', token);
  const [tab, setTab] = useState<Tab>('game');
  const [info, setInfo] = useState<ServerInfo | null>(null);
  useEffect(() => { api<ServerInfo>('GET', '/api/info').then(setInfo).catch(() => undefined); }, []);
  useEffect(() => { if (link === 'unauthorized') onSignOut(); }, [link, onSignOut]);

  const inGame = state && state.phase !== 'idle';

  return (
    <div className="mx-auto min-h-dvh max-w-[88rem] px-4 pb-16 pt-4 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-gold/25 pb-3">
        <Logo size="sm" />
        <nav className="flex flex-1 flex-wrap gap-1" aria-label="Host sections">
          {TABS.map((t) => (
            <button
              key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              className={`px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] transition ${tab === t.id ? 'bg-gold/15 text-gold-light shadow-[inset_0_-2px_0_#d9b45b]' : 'text-mute hover:text-cream'}`}
            >
              {t.label}
              {t.id === 'game' && inGame ? <span className="ml-2 inline-block h-2 w-2 animate-shimmer rounded-full bg-jade-glow align-middle" aria-label="Game in progress" /> : null}
            </button>
          ))}
        </nav>
        <LinkBadge link={link} />
        <a className="text-sm uppercase tracking-[0.16em] text-mute hover:text-gold-light" href="/screen" target="_blank" rel="noreferrer">Open big screen ↗</a>
        <Button size="sm" variant="ghost" onClick={onSignOut}>Sign out</Button>
      </header>

      {!state ? <div className="grid place-items-center py-24"><Spinner label="Connecting" /></div> : (
        <>
          {tab === 'game' ? (inGame ? <Live state={state} skew={skew} info={info} /> : <Setup />) : null}
          {tab === 'questions' ? <QuestionBank /> : null}
          {tab === 'history' ? <History /> : null}
          {tab === 'settings' ? <Settings info={info} onPinChanged={onToken} /> : null}
        </>
      )}
    </div>
  );
}

function LinkBadge({ link }: { link: Link }) {
  const ok = link === 'open';
  return (
    <span className={`flex items-center gap-2 text-xs uppercase tracking-[0.18em] ${ok ? 'text-jade-glow' : 'text-ruby'}`} role="status">
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-jade-glow' : 'animate-shimmer bg-ruby'}`} />
      {ok ? 'Live' : 'Reconnecting'}
    </span>
  );
}
