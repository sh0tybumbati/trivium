import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** QR code rendered to an image; dark modules on a cream tile so phones scan it from across a room. */
export function QR({ value, size = 220, className = '' }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, color: { dark: '#0a1210', light: '#f3ead3' } })
      .then((url) => { if (live) setSrc(url); })
      .catch(() => { if (live) setSrc(''); });
    return () => { live = false; };
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size }} className={`bg-cream/10 ${className}`} />;
  return <img src={src} width={size} height={size} alt={`QR code for ${value}`} className={className} style={{ imageRendering: 'pixelated' }} />;
}
