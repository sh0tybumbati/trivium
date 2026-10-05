import { KEYS, store } from './storage';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type Auth = 'host' | 'player' | 'none';

export async function api<T = unknown>(method: string, path: string, body?: unknown, auth: Auth = 'none'): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth === 'host') {
    const token = store.get(KEYS.host);
    if (token) headers.authorization = `Bearer ${token}`;
  }
  if (auth === 'player') {
    const token = store.get(KEYS.player);
    if (token) headers['x-player-token'] = token;
  }
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Request failed (${res.status}).`;
    if (res.status === 401 && auth === 'host') store.remove(KEYS.host);
    throw new ApiError(message, res.status);
  }
  return data as T;
}

/** Host actions: POST /api/game/:action */
export const hostAction = (action: string, body: Record<string, unknown> = {}) => api('POST', `/api/game/${action}`, body, 'host');
