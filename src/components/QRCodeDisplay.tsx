import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  url: string;
  size?: number;
  className?: string;
}

const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ 
  url, 
  size = 200, 
  className = '' 
}) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const generateQRCode = async () => {
      try {
        const qrDataURL = await QRCode.toDataURL(url, {
          width: size,
          margin: 2,
          color: {
            dark: '#059669', // emerald-600
            light: '#FFFFFF'
          },
          errorCorrectionLevel: 'M'
        });
        setQrCodeUrl(qrDataURL);
        setError('');
      } catch (err) {
        console.error('Failed to generate QR code:', err);
        setError('Failed to generate QR code');
      }
    };

    if (url) {
      generateQRCode();
    }
  }, [url, size]);

  if (error) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-red-400 text-center">
          <p>QR Code Error</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!qrCodeUrl) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400"></div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <img 
        src={qrCodeUrl} 
        alt="QR Code" 
        className="rounded-lg bg-white p-2 shadow-lg"
      />
      <p className="text-sm text-emerald-200 mt-2 text-center break-all">
        {url}
      </p>
    </div>
  );
};

export default QRCodeDisplay;