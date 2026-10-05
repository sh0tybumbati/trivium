import type { ServerInfo } from './types';

const isLoopback = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]';

/** The address phones should open. It is never "localhost", which would point at the phone itself. */
export function appBase(info: ServerInfo | null): string {
  if (info?.publicUrl) return info.publicUrl.replace(/\/$/, '');
  if (isLoopback(location.hostname) && info?.urls[0]) return info.urls[0];
  return location.origin;
}

export function joinUrl(info: ServerInfo | null, code?: string): string {
  return `${appBase(info)}/play${info?.codeRequired && code ? `?code=${code}` : ''}`;
}
