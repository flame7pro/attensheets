// components/NetworkStatus.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, AlertTriangle } from 'lucide-react';

export const NetworkStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [showStatus, setShowStatus] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      console.log('🟢 Network connection restored');
      setIsOnline(true);
      
      if (wasOffline) {
        setShowStatus(true);
        // Hide "back online" message after 3 seconds
        setTimeout(() => setShowStatus(false), 3000);
      }
      
      setWasOffline(false);
    };

    const handleOffline = () => {
      console.log('🔴 Network connection lost');
      setIsOnline(false);
      setShowStatus(true);
      setWasOffline(true);
    };

    // Set initial state
    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  // Don't show anything if online and never was offline
  if (!showStatus) return null;

  return (
    <>
      {/* Desktop notification */}
      <div className={`hidden md:block fixed top-20 right-4 z-50 px-4 py-3 rounded-xl shadow-lg transition-all duration-300 ${
        isOnline 
          ? 'bg-green-500 animate-slide-down' 
          : 'bg-red-500 animate-shake'
      } text-white`}>
        <div className="flex items-center gap-3">
          {isOnline ? (
            <Wifi className="w-5 h-5" />
          ) : (
            <WifiOff className="w-5 h-5" />
          )}
          <div>
            <p className="font-semibold text-sm">
              {isOnline ? 'Back Online' : 'No Internet Connection'}
            </p>
            <p className="text-xs opacity-90">
              {isOnline 
                ? 'Syncing data...' 
                : 'Changes will be saved when connection is restored'}
            </p>
          </div>
        </div>
      </div>

      {/* Mobile notification */}
      <div className={`md:hidden fixed top-16 left-4 right-4 z-50 px-3 py-2.5 rounded-lg shadow-lg transition-all duration-300 ${
        isOnline 
          ? 'bg-green-500 animate-slide-down' 
          : 'bg-red-500 animate-shake'
      } text-white`}>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Wifi className="w-4 h-4 flex-shrink-0" />
          ) : (
            <WifiOff className="w-4 h-4 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-xs truncate">
              {isOnline ? 'Back Online' : 'No Connection'}
            </p>
            <p className="text-xs opacity-90 truncate">
              {isOnline ? 'Syncing...' : 'Waiting for network'}
            </p>
          </div>
        </div>
      </div>

      {/* Persistent banner when offline */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium shadow-lg">
          <div className="flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Working Offline - Changes will sync when online</span>
          </div>
        </div>
      )}
    </>
  );
};

/**
 * Hook to check online status
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}
