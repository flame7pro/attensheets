// components/NetworkStatus.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

export const NetworkStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [showNotification, setShowNotification] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    // Check if we're in the browser
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      console.log('✅ Network restored');
      setIsOnline(true);
      setJustReconnected(true);
      setShowNotification(true);
      
      // Hide success notification after 4 seconds
      setTimeout(() => {
        setShowNotification(false);
        setJustReconnected(false);
      }, 4000);
    };

    const handleOffline = () => {
      console.log('❌ Network lost');
      setIsOnline(false);
      setJustReconnected(false);
      
      // Show toast notification when going offline
      setShowNotification(true);
      
      // Hide toast after 5 seconds
      setTimeout(() => {
        setShowNotification(false);
      }, 5000);
    };

    // Set initial state (don't show notification on mount)
    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Only show toast notification
  if (!showNotification) return null;

  return (
    <>
      {/* Floating Toast Notification Only */}
      <div 
        className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] 
          px-4 py-3 rounded-xl shadow-2xl backdrop-blur-sm
          transition-all duration-500 ease-out
          ${showNotification ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}
          ${isOnline && justReconnected
            ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white' 
            : 'bg-gradient-to-r from-red-500 to-rose-500 text-white'
          }
        `}
        style={{
          animation: isOnline && justReconnected 
            ? 'slideDown 0.5s ease-out' 
            : 'shake 0.5s ease-in-out'
        }}
      >
        <div className="flex items-center gap-3 min-w-[280px] sm:min-w-[320px]">
          {/* Icon */}
          <div className={`flex-shrink-0 ${justReconnected ? 'animate-spin-slow' : 'animate-pulse'}`}>
            {isOnline && justReconnected ? (
              <Wifi className="w-5 h-5" strokeWidth={2.5} />
            ) : (
              <WifiOff className="w-5 h-5" strokeWidth={2.5} />
            )}
          </div>

          {/* Content */}
          <div className="flex-1">
            <p className="font-semibold text-sm leading-tight">
              {isOnline && justReconnected ? 'Connected!' : 'No Internet'}
            </p>
            <p className="text-xs opacity-90 mt-0.5">
              {isOnline && justReconnected
                ? 'Syncing attendance data...' 
                : 'Check your connection'
              }
            </p>
          </div>

          {/* Syncing indicator */}
          {isOnline && justReconnected && (
            <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={2} />
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translate(-50%, -20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }

        @keyframes shake {
          0%, 100% { transform: translate(-50%, 0) rotate(0deg); }
          25% { transform: translate(-50%, 0) rotate(-2deg); }
          75% { transform: translate(-50%, 0) rotate(2deg); }
        }

        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .animate-spin-slow {
          animation: spin-slow 2s linear 1;
        }
      `}</style>
    </>
  );
};

/**
 * Hook to check network status in components
 * 
 * @example
 * const { isOnline } = useNetworkStatus();
 * 
 * if (!isOnline) {
 *   return <div>Please check your internet connection</div>;
 * }
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [hasBeenOffline, setHasBeenOffline] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setHasBeenOffline(true);
    };

    // Set initial state
    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { 
    isOnline, 
    hasBeenOffline,
    // Helper to show warning in UI
    showWarning: !isOnline || hasBeenOffline 
  };
}
