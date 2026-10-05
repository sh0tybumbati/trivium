import { useEffect, useRef, useState } from 'react';
import type { GameView } from './types';
import { KEYS, store } from './storage';

export type Link = 'connecting' | 'open' | 'reconnecting' | 'unauthorized';
type Role = 'host' | 'screen' | 'player';

/**
 * Subscribe to the server's filtered view of the game. Reconnects with backoff,
 * and exposes the offset between the server clock and this device's clock so
 * countdowns agree on every screen.
 */
export function useGame(role: Role, token: string | null = null) {
  const [state, setState] = useState<GameView | null>(null);
  const [link, setLink] = useState<Link>('connecting');
  const [skew, setSkew] = useState(0);
  const [expired, setExpired] = useState(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => {
        retry = 0;
        ws?.send(JSON.stringify({ type: 'hello', role, token: tokenRef.current }));
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === 'state') {
          setState(msg.state as GameView);
          setSkew((msg.state as GameView).serverNow - Date.now());
          setLink('open');
        } else if (msg.type === 'unauthorized') {
          store.remove(KEYS.host);
          setLink('unauthorized');
        } else if (msg.type === 'session-expired') {
          setExpired(true);
        }
      };
      ws.onclose = (ev) => {
        if (closed || ev.code === 4001) return;
        setLink('reconnecting');
        timer = setTimeout(connect, Math.min(5000, 500 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [role, token]);

  return { state, link, skew, expired };
}
