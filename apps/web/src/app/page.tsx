"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-100">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-500"></div>
    </div>
  );
}
