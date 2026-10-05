import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ServerInfo } from '../lib/types';
import { Divider, Frame, Logo } from '../ui/Deco';

const CARDS = [
  { href: '/play', title: 'Play', blurb: 'Join the game from your phone.' },
  { href: '/screen', title: 'Big Screen', blurb: 'Show the questions on a TV or projector.' },
  { href: '/host', title: 'Host', blurb: 'Run the game and manage questions.' },
];

export function Landing() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  useEffect(() => { api<ServerInfo>('GET', '/api/info').then(setInfo).catch(() => setInfo(null)); }, []);

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      <div className="rays pointer-events-none absolute inset-x-0 bottom-0 h-[70vh]" aria-hidden />
      <div className="relative w-full max-w-3xl text-center">
        <Logo size="xl" />
        <p className="mt-4 text-lg uppercase tracking-[0.35em] text-gold-light">Trivia night, upgraded</p>
        <Divider className="mx-auto my-8 max-w-sm" />
        <nav className="grid gap-4 sm:grid-cols-3" aria-label="Choose your role">
          {CARDS.map((c, i) => (
            <a key={c.href} href={c.href} className="group block animate-rise" style={{ animationDelay: `${i * 90}ms` }}>
              <Frame className="transition group-hover:-translate-y-1 group-hover:brightness-110" inner="px-5 py-7">
                <div className="display text-3xl text-gold-light">{c.title}</div>
                <p className="mt-2 text-sm text-mute">{c.blurb}</p>
              </Frame>
            </a>
          ))}
        </nav>
        {info && info.phase !== 'idle' && info.phase !== 'finished' ? (
          <p className="mt-8 text-sm uppercase tracking-[0.25em] text-jade-glow">A game is open: {info.title}</p>
        ) : null}
      </div>
    </main>
  );
}
