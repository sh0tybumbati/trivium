export interface StandingRow {
  id: string;
  name: string;
  score: number;
  rank: number;
  color?: string;
  sub?: string;
  highlight?: boolean;
  dim?: boolean;
}

const medal = (rank: number) => (rank === 1 ? 'text-gold-light' : rank === 2 ? 'text-[#c9d1d3]' : rank === 3 ? 'text-[#c98a55]' : 'text-mute');

/** Ranked bars. size "lg" is for the big screen, "md" for phones and the console. */
export function Standings({ rows, limit, size = 'md' }: { rows: StandingRow[]; limit?: number; size?: 'md' | 'lg' }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const max = Math.max(1, ...shown.map((r) => r.score));
  const lg = size === 'lg';
  return (
    <ol className={lg ? 'space-y-[1.2vh]' : 'space-y-2'}>
      {shown.map((r, i) => (
        <li
          key={r.id}
          className={`relative flex animate-rise items-center overflow-hidden border ${r.highlight ? 'border-gold-light bg-gold/10' : 'border-gold/20 bg-panel/70'} ${r.dim ? 'opacity-50' : ''} ${lg ? 'gap-[1.6vw] px-[1.6vw] py-[1.1vh]' : 'gap-3 px-3 py-2'}`}
          style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
        >
          <span
            className="absolute inset-y-0 left-0 opacity-25 transition-[width] duration-700 ease-out"
            style={{ width: `${(r.score / max) * 100}%`, background: r.color ?? 'linear-gradient(90deg,#d9b45b,#f1d98f)' }}
            aria-hidden
          />
          <span className={`num relative text-center ${medal(r.rank)} ${lg ? 'w-[4vw] text-[2.6vw]' : 'w-8 text-xl'}`}>{r.rank}</span>
          {r.color ? <span className={`relative shrink-0 rotate-45 ${lg ? 'h-[1.2vw] w-[1.2vw]' : 'h-2.5 w-2.5'}`} style={{ background: r.color }} aria-hidden /> : null}
          <span className={`relative min-w-0 flex-1 truncate font-semibold ${lg ? 'text-[2.2vw]' : 'text-base'}`}>
            {r.name}
            {r.sub ? <span className={`ml-2 font-normal text-mute ${lg ? 'text-[1.3vw]' : 'text-xs'}`}>{r.sub}</span> : null}
          </span>
          <span className={`num relative text-gold-light ${lg ? 'text-[2.6vw]' : 'text-xl'}`}>{r.score}</span>
        </li>
      ))}
    </ol>
  );
}
