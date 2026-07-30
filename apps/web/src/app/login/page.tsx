"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { isRenderWakeupEnabled, wakeApi } from '@/lib/api-wakeup';
import { ShieldCheck, Mail, Lock, Key, ArrowRight, AlertCircle } from 'lucide-react';

function LoginPageContent() {
  const { login, mfaAuthenticate } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  // States
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    searchParams.get('expired')
      ? 'Your session has expired. Please log in again.'
      : null,
  );
  const [successMsg, setSuccessMsg] = useState<string | null>(() =>
    searchParams.get('resetSuccess')
      ? 'Password reset successfully. Please log in.'
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [serverWaking, setServerWaking] = useState(
    isRenderWakeupEnabled,
  );

  useEffect(() => {
    if (!isRenderWakeupEnabled()) {
      return;
    }

    let active = true;
    void wakeApi()
      .catch(() => {
        // The submit action will retry and show an error if wake-up still fails.
      })
      .finally(() => {
        if (active) {
          setServerWaking(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      setServerWaking(true);
      await wakeApi();
      setServerWaking(false);
      const res = await login(email, password);
      if (res.mfaRequired) {
        setMfaRequired(true);
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Invalid email or password.',
      );
    } finally {
      setServerWaking(false);
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!mfaCode || mfaCode.length !== 6) {
      setError('Please enter a valid 6-digit code.');
      return;
    }

    setLoading(true);
    try {
      await mfaAuthenticate(email, mfaCode);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Invalid authentication code.',
      );
    } finally {
      setLoading(false);
    }
  };

  const triggerOAuth = async (provider: 'google' | 'github') => {
    setError(null);
    setLoading(true);
    setServerWaking(true);

    try {
      await wakeApi();
      window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/auth/${provider}`;
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'The server could not be reached. Please try again.',
      );
      setLoading(false);
      setServerWaking(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090d16] px-4 py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-violet-600/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-lg shadow-violet-500/20 mb-4 animate-pulse-glow">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white">
            {mfaRequired ? 'Enter Security Code' : 'Welcome back'}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {mfaRequired
              ? 'Provide the 6-digit OTP from your authenticator app'
              : 'Sign in to access your developer console'}
          </p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-8 shadow-2xl relative">
          <div className="absolute inset-0 rounded-2xl pointer-events-none border border-violet-500/10"></div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-sm flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {serverWaking && (
            <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
              The server is waking up. This can take about a minute on the free Render plan.
            </div>
          )}

          {!mfaRequired ? (
            <>
              <form onSubmit={handleCredentialsSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-500" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className="block w-full pl-10 pr-3 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all text-sm"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Password
                    </label>
                    <Link
                      href="/forgot-password"
                      className="text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-500" />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="block w-full pl-10 pr-3 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl text-sm font-semibold text-white transition-all duration-200 transform hover:-translate-y-[1px] active:translate-y-0 shadow-lg shadow-violet-600/20 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 mt-6 animate-pulse-glow cursor-pointer"
                >
                  {serverWaking ? 'Waking server...' : loading ? 'Signing in...' : 'Sign In'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-900/60 px-3 text-slate-500 font-medium">Or continue with</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => triggerOAuth('google')}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-white transition-colors text-sm font-medium cursor-pointer"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                  </svg>
                  Google
                </button>
                <button
                  onClick={() => triggerOAuth('github')}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-white transition-colors text-sm font-medium cursor-pointer"
                >
                  <svg className="h-4 w-4 fill-current shrink-0" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                  </svg>
                  GitHub
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleMfaSubmit} className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Verification Code
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="h-5 w-5 text-slate-500" />
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    pattern="[0-9]*"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="block w-full pl-10 pr-3 py-3 bg-slate-950 border border-slate-800 rounded-xl text-center text-lg font-mono tracking-widest text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-600/20 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
              >
                {loading ? 'Verifying...' : 'Verify Code'}
                <ShieldCheck className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setMfaRequired(false)}
                className="w-full text-center text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors pt-2 block"
              >
                Back to credentials login
              </button>
            </form>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          Not registered yet?{' '}
          <Link
            href="/register"
            className="font-medium text-violet-400 hover:text-violet-300 transition-colors"
          >
            Create a tenant account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-500"></div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
