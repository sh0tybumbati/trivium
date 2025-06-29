import React from 'react';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';

interface ConnectionStatusProps {
  isConnected: boolean;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ 
  isConnected, 
  isLoading = false, 
  error = null,
  className = '' 
}) => {
  if (isLoading) {
    return (
      <div className={`flex items-center space-x-2 text-amber-300 ${className}`}>
        <div className="animate-spin w-4 h-4 border-2 border-amber-300 border-t-transparent rounded-full"></div>
        <span className="text-sm">Connecting...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center space-x-2 text-red-400 ${className}`}>
        <AlertCircle className="w-4 h-4" />
        <span className="text-sm">Error: {error}</span>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className={`flex items-center space-x-2 text-emerald-400 ${className}`}>
        <Wifi className="w-4 h-4" />
        <span className="text-sm">Connected</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center space-x-2 text-red-400 ${className}`}>
      <WifiOff className="w-4 h-4" />
      <span className="text-sm">Disconnected</span>
    </div>
  );
};

export default ConnectionStatus;