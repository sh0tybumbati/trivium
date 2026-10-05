/** Depleting bar plus seconds readout. Turns ruby in the final five seconds. */
export function TimerBar({ fraction, seconds, big = false }: { fraction: number; seconds: number; big?: boolean }) {
  const urgent = seconds <= 5;
  return (
    <div className="flex items-center gap-4" role="timer" aria-label={`${seconds} seconds left`}>
      <div className={`relative flex-1 overflow-hidden border border-gold/40 bg-ink/70 ${big ? 'h-5' : 'h-3'}`}>
        <div
          className={`h-full transition-[width] duration-150 ease-linear ${urgent ? 'bg-ruby' : 'bg-gradient-to-r from-gold-dark via-gold to-gold-light'}`}
          style={{ width: `${Math.round(fraction * 1000) / 10}%` }}
        />
      </div>
      <span className={`num ${big ? 'w-24 text-6xl' : 'w-12 text-2xl'} text-right ${urgent ? 'text-ruby' : 'text-gold-light'}`}>{seconds}</span>
    </div>
  );
}
