import type { GameView } from '../lib/types';
import type { StandingRow } from './Standings';

export function playerRows(state: GameView, meId?: string): StandingRow[] {
  const team = new Map((state.teams ?? []).map((t) => [t.id, t]));
  return (state.players ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    score: p.score,
    rank: p.rank,
    color: p.teamId ? team.get(p.teamId)?.color : undefined,
    sub: p.teamId ? team.get(p.teamId)?.name : undefined,
    highlight: p.id === meId,
    dim: !p.connected,
  }));
}

export function teamRows(state: GameView, myTeamId?: string | null): StandingRow[] {
  return (state.teams ?? []).map((t) => ({
    id: t.id, name: t.name, score: t.score, rank: t.rank, color: t.color,
    sub: `${t.members} ${t.members === 1 ? 'player' : 'players'}`, highlight: t.id === myTeamId,
  }));
}
