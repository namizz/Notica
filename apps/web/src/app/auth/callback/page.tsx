"use client";

import { useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

function AuthCallbackHandler() {
  const { setOAuthSession } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const userId = searchParams.get('userId');
    const email = searchParams.get('email');
    const role = searchParams.get('role');
    const tenantId = searchParams.get('tenantId');
    const isTwoFactorEnabled = searchParams.get('isTwoFactorEnabled') === 'true';

    if (accessToken && refreshToken && userId && email && role && tenantId) {
      try {
        setOAuthSession({
          accessToken,
          refreshToken,
          user: {
            id: userId,
            email,
            role,
            tenantId,
            isTwoFactorEnabled,
          },
        });
        router.replace('/dashboard');
      } catch (e) {
        console.error('OAuth callback initialization failed', e);
        router.replace('/login?error=oauth_failed');
      }
    } else {
      router.replace('/login?error=invalid_callback');
    }
  }, [searchParams, setOAuthSession, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-100">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-20 w-20 animate-ping rounded-full bg-violet-600/25 opacity-75"></div>
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-violet-500/20 border-t-violet-500"></div>
      </div>
      <h2 className="mt-6 text-lg font-medium tracking-wider text-slate-400">
        Completing Secure Sign In...
      </h2>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-500"></div>
      </div>
    }>
      <AuthCallbackHandler />
    </Suspense>
  );
}
