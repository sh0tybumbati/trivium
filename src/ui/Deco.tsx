import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

type CutStyle = CSSProperties & { '--frame-cut'?: string; '--cut'?: string };

/** Gold-edged panel with chamfered corners. */
export function Frame({ children, className = '', inner = '', cut = 14, tone }: {
  children: ReactNode; className?: string; inner?: string; cut?: number; tone?: 'jade'; }) {
  const style: CutStyle = { '--cut': `${cut}px`, '--frame-cut': `${cut}px` };
  return (
    <div className={`frame ${tone === 'jade' ? 'frame-jade' : ''} ${className}`} style={style}>
      <div className={`frame-in ${inner}`} style={style}>{children}</div>
    </div>
  );
}

type Variant = 'gold' | 'ghost' | 'jade' | 'danger';
export function Button({ variant = 'gold', size = 'md', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: 'sm' | 'md' | 'lg'; }) {
  const v = { gold: '', ghost: 'btn-ghost', jade: 'btn-jade', danger: 'btn-danger' }[variant];
  const s = { sm: 'btn-sm', md: '', lg: 'btn-lg' }[size];
  return <button type="button" className={`btn ${v} ${s} ${className}`} {...rest} />;
}

export function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`chip ${className}`}>{children}</span>;
}

/** ——◆—— divider */
export function Divider({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 text-gold ${className}`} aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/60" />
      <span className="h-2 w-2 rotate-45 bg-gold" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/60" />
    </div>
  );
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'xl' | 'screen' }) {
  const cls = { sm: 'text-2xl', md: 'text-5xl', xl: 'text-[clamp(4rem,11vw,9rem)]', screen: 'text-[13vw]' }[size];
  return <div className={`display gold-text leading-none ${cls}`}>TRIVIUM</div>;
}

export function Diamond({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-2 w-2 rotate-45 bg-gold ${className}`} aria-hidden />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-gold" role="status">
      <span className="h-8 w-8 rotate-45 animate-shimmer border-2 border-gold" />
      {label ? <span className="text-sm uppercase tracking-[0.2em] text-mute">{label}</span> : null}
    </div>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`border px-4 py-3 text-sm ${tone === 'error' ? 'border-ruby/60 bg-ruby/10 text-[#ffb3b8]' : 'border-gold/30 bg-gold/5 text-gold-light'}`}>
      {children}
    </p>
  );
}
