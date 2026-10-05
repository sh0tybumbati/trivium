import type { StandingRow } from './Standings';

/** Stepped Art Deco podium for the top three. Ties share a step height. */
export function Podium({ rows, size = 'md' }: { rows: StandingRow[]; size?: 'md' | 'lg' }) {
  const top = rows.filter((r) => r.rank <= 3).slice(0, 5);
  if (!top.length) return null;
  const lg = size === 'lg';
  // classic arrangement: 2nd, 1st, 3rd
  const byRank = (n: number) => top.filter((r) => r.rank === n);
  const columns = [byRank(2), byRank(1), byRank(3)].filter((c) => c.length);
  const height = { 1: lg ? '30vh' : '9rem', 2: lg ? '21vh' : '6.5rem', 3: lg ? '14vh' : '4.5rem' } as const;
  return (
    <div className={`flex items-end justify-center ${lg ? 'gap-[1.5vw]' : 'gap-2'}`}>
      {columns.map((col, ci) => {
        const rank = col[0].rank as 1 | 2 | 3;
        return (
          <div key={rank} className="flex min-w-0 flex-1 animate-rise flex-col items-center" style={{ animationDelay: `${(columns.length - 1 - ci) * 220 + 200}ms`, maxWidth: lg ? '26vw' : '10rem' }}>
            <div className="mb-2 w-full text-center">
              {col.map((r) => (
                <div key={r.id} className="min-w-0">
                  <div className={`truncate font-semibold ${lg ? 'text-[2.2vw]' : 'text-base'} ${rank === 1 ? 'text-gold-light' : 'text-cream'}`}>{r.name}</div>
                  <div className={`num text-gold ${lg ? 'text-[2.4vw]' : 'text-xl'}`}>{r.score}</div>
                </div>
              ))}
            </div>
            <div
              className="cut flex w-full items-start justify-center pt-2"
              style={{ height: height[rank], ['--cut' as string]: lg ? '1.4vw' : '12px', background: rank === 1 ? 'linear-gradient(180deg,#f1d98f,#9c7a2e)' : rank === 2 ? 'linear-gradient(180deg,#d7dcdc,#7d8888)' : 'linear-gradient(180deg,#d9a06b,#7a4a24)' }}
            >
              <span className={`display text-ink/80 ${lg ? 'text-[5vw]' : 'text-4xl'}`}>{rank}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
