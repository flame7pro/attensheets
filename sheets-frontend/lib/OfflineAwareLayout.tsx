// lib/OfflineAwareLayout.tsx
'use client';

import { useNetworkStatus } from '@/components/NetworkStatus';

export function OfflineAwareLayout({ children }: { children: React.ReactNode }) {
  const { isOnline } = useNetworkStatus();

  return (
    <div className={!isOnline ? 'pt-10' : ''}>
      {children}
    </div>
  );
}
