// localStorage can throw (private mode, blocked storage); the app must still work without it.
export const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  },
  remove(key: string) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

export const KEYS = { host: 'trivium.host', player: 'trivium.player', muted: 'trivium.muted' };
