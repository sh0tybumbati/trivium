import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { appBase } from '../../lib/joinUrl';
import type { ServerInfo, SetupInfo } from '../../lib/types';
import { Button, Frame, Notice } from '../../ui/Deco';
import { QR } from '../../ui/QR';
import { useRun } from './useRun';

export function Settings({ info, onPinChanged }: { info: ServerInfo | null; onPinChanged: (token: string) => void }) {
  const [setup, setSetup] = useState<SetupInfo | null>(null);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const { busy, error, run } = useRun();

  const load = () => api<SetupInfo>('GET', '/api/setup', undefined, 'host').then(setSetup).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const out = await api<{ token: string }>('PUT', '/api/host/pin', { pin }, 'host');
      onPinChanged(out.token);
      setPin('');
      setMessage('PIN saved. Anyone opening the host console now needs it.');
      await load();
    });
  };
  const remove = () => run(async () => {
    const out = await api<{ token: string }>('PUT', '/api/host/pin', { pin: null }, 'host');
    onPinChanged(out.token);
    setMessage('PIN removed. The host console is limited to this machine again.');
    await load();
  });

  const base = appBase(info);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Frame inner="p-6">
        <h2 className="display mb-1 text-xl text-gold-light">Host PIN</h2>
        <p className="mb-4 text-sm text-mute">
          {setup?.hasPin
            ? 'A PIN is set. Anyone who opens the host console needs it.'
            : 'No PIN yet, so the host console only opens on this machine. Set a PIN to run the game from a phone or tablet, or from outside this network.'}
        </p>
        {setup?.pinFromEnv ? <Notice>The PIN comes from the HOST_PIN environment variable. Change it there.</Notice> : (
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="label" htmlFor="new-pin">{setup?.hasPin ? 'New PIN' : 'PIN'} (4 to 12 digits)</label>
              <input id="new-pin" className="input w-48 text-xl tracking-[0.3em]" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))} autoComplete="new-password" />
            </div>
            {error ? <Notice tone="error">{error}</Notice> : null}
            {message ? <Notice>{message}</Notice> : null}
            <div className="flex gap-3">
              <Button type="submit" disabled={busy || pin.length < 4}>{setup?.hasPin ? 'Change PIN' : 'Set PIN'}</Button>
              {setup?.hasPin ? <Button variant="ghost" disabled={busy} onClick={remove}>Remove PIN</Button> : null}
            </div>
          </form>
        )}
      </Frame>

      <Frame inner="p-6">
        <h2 className="display mb-4 text-xl text-gold-light">Links</h2>
        <dl className="space-y-3 text-sm">
          <div><dt className="label">Players</dt><dd className="break-all text-gold-light">{base}/play</dd></div>
          <div><dt className="label">Big screen</dt><dd className="break-all text-gold-light">{base}/screen</dd></div>
          <div><dt className="label">Host</dt><dd className="break-all text-gold-light">{base}/host</dd></div>
        </dl>
        <div className="mt-4 flex items-end gap-4">
          <QR value={`${base}/play`} size={110} />
          <p className="text-sm text-mute">Phones on the same Wi-Fi can scan this to join.</p>
        </div>
      </Frame>

      <Frame inner="p-6" className="lg:col-span-2">
        <h2 className="display mb-3 text-xl text-gold-light">Running it beyond this room</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-mute">
          <li>Put Trivium behind a tunnel or reverse proxy, then set <code className="text-gold-light">PUBLIC_URL</code> so the QR codes use your public address.</li>
          <li>Set <code className="text-gold-light">HOST_PIN</code> (or the PIN above) before exposing it. Without one, the host console only answers on this machine.</li>
          <li>Set <code className="text-gold-light">REQUIRE_JOIN_CODE=1</code> to make players enter the four-letter code shown on the big screen.</li>
        </ul>
      </Frame>
    </div>
  );
}
