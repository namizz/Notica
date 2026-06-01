"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-100">
        <div className="relative flex items-center justify-center">
          {/* Glowing pulse ring */}
          <div className="absolute h-20 w-20 animate-ping rounded-full bg-violet-600/25 opacity-75"></div>
          {/* Spinning gradient ring */}
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-violet-500/20 border-t-violet-500"></div>
        </div>
        <h2 className="mt-6 text-lg font-medium tracking-wider text-slate-400 animate-pulse">
          Initializing Notica...
        </h2>
      </div>
    );
  }

  // Prevent flash of content before redirect completes
  if (!user) {
    return null;
  }

  return <>{children}</>;
}
