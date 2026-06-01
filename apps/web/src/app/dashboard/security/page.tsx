"use client";

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { ShieldCheck, ShieldAlert, Key, QrCode, Lock, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';

export default function SecurityPage() {
  const { user, updateUser } = useAuth();

  // Setup State
  const [setupMode, setSetupMode] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  
  // UX State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const startSetup = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/2fa/generate');
      if (res.ok) {
        const data = await res.json();
        setQrCodeUrl(data.qrCodeDataUrl);
        setSecretKey(data.secret);
        setSetupMode(true);
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to initialize 2FA setup.');
      }
    } catch (e) {
      setError('An error occurred during 2FA initialization.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!verifyCode || verifyCode.length !== 6) {
      setError('Please enter a valid 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/2fa/turn-on', { code: verifyCode });
      if (res.ok) {
        setSuccess('Two-factor authentication has been enabled successfully!');
        updateUser({ isTwoFactorEnabled: true });
        setSetupMode(false);
        setQrCodeUrl(null);
        setSecretKey(null);
        setVerifyCode('');
      } else {
        const err = await res.json();
        setError(err.message || 'Invalid verification code. Please try again.');
      }
    } catch (e) {
      setError('Error enabling two-factor authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Security Settings</h2>
        <p className="text-sm text-slate-400">Configure multi-factor authentication to protect your developer keys and tenant resources</p>
      </div>

      {success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm flex items-start gap-3">
          <CheckCircle className="h-5 w-5 shrink-0 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-sm flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Status Panel */}
      <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-6 space-y-6">
        <div className="flex items-start gap-4">
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
            user?.isTwoFactorEnabled 
              ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400' 
              : 'bg-slate-950 border border-slate-800 text-slate-500'
          }`}>
            {user?.isTwoFactorEnabled ? <ShieldCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
          </div>
          
          <div className="space-y-1">
            <h3 className="text-md font-bold text-white">Two-Factor Authentication (2FA)</h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
              Two-factor authentication adds an extra layer of security to your account. In addition to your password, you will be prompted to enter a 6-digit verification code from your authenticator app (like Google Authenticator or 1Password) during login.
            </p>
          </div>
        </div>

        {!user?.isTwoFactorEnabled && !setupMode && (
          <div className="pt-4 border-t border-slate-900">
            <button
              onClick={startSetup}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-violet-600 hover:bg-violet-500 rounded-xl text-xs font-semibold text-white transition-all shadow-md shadow-violet-600/10"
            >
              <Key className="h-4 w-4" />
              {loading ? 'Initializing...' : 'Enable Two-Factor Authentication'}
            </button>
          </div>
        )}

        {user?.isTwoFactorEnabled && (
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-900 text-slate-300 text-xs flex items-center gap-2 max-w-xl font-medium">
            <Lock className="h-4 w-4 text-violet-400 shrink-0" />
            <span>MFA is currently active. Your account is fully protected.</span>
          </div>
        )}
      </div>

      {/* 2FA Verification and Setup Wizard */}
      {setupMode && (
        <div className="bg-slate-900/30 border border-violet-500/20 rounded-2xl p-6 space-y-6 animate-pulse-glow">
          <div className="flex items-center gap-2 text-white font-bold">
            <QrCode className="h-5 w-5 text-violet-400" />
            <h3>Configure Authenticator App</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-center">
            {/* Step QR Code */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-3">
              {qrCodeUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrCodeUrl}
                  alt="2FA QR Code"
                  className="h-40 w-40 rounded bg-white p-1"
                />
              ) : (
                <div className="h-40 w-40 rounded bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 text-xs">Generating QR...</div>
              )}
              <span className="text-[10px] text-slate-400 text-center max-w-[200px]">Scan this QR code with your mobile authenticator app.</span>
            </div>

            {/* Step Form */}
            <div className="space-y-4">
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Manual Setup Key</span>
                <code className="block p-3 bg-slate-950 border border-slate-900 rounded-lg text-xs text-violet-300 font-mono select-all break-all tracking-wider">{secretKey}</code>
              </div>

              <form onSubmit={handleVerifyAndEnable} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    pattern="[0-9]*"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="block w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all text-sm font-mono text-center tracking-widest text-lg"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={loading || verifyCode.length !== 6}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-violet-600/10 transition-all disabled:opacity-50"
                  >
                    Verify and Enable
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSetupMode(false);
                      setQrCodeUrl(null);
                      setSecretKey(null);
                      setVerifyCode('');
                    }}
                    className="px-4 py-2.5 bg-transparent border border-slate-850 hover:bg-slate-900/50 hover:border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
