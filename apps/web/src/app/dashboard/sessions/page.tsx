"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { api, getAccessToken } from '@/lib/api';
import { Monitor, Smartphone, Globe, ShieldAlert, LogOut, CheckCircle, Clock } from 'lucide-react';

interface UserSession {
  id: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  expiresAt: string;
}

function getCurrentSessionId() {
  const token = getAccessToken();
  if (!token) return null;

  try {
    const payloadBase64 = token.split('.')[1];
    const decodedPayload = JSON.parse(atob(payloadBase64)) as {
      sid?: unknown;
    };
    return typeof decodedPayload.sid === 'string' ? decodedPayload.sid : null;
  } catch (error: unknown) {
    console.error(
      'Failed to decode active token for session tracking',
      error,
    );
    return null;
  }
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const currentSid = getCurrentSessionId();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.get('/auth/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      } else {
        setError('Failed to retrieve active sessions.');
      }
    } catch {
      setError('An error occurred while loading session details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetching is an external synchronization; state updates occur from the request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSessions();
  }, [fetchSessions]);

  const handleRevokeSession = async (id: string) => {
    setRevokingId(id);
    try {
      const res = await api.delete(`/auth/sessions/${id}`);
      if (res.ok) {
        void fetchSessions();
      } else {
        alert('Failed to revoke session.');
      }
    } catch {
      alert('Error revoking session.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOthers = async () => {
    if (!confirm('Are you sure you want to log out all other active sessions and devices?')) return;

    setRevokingOthers(true);
    try {
      const res = await api.delete('/auth/sessions');
      if (res.ok) {
        void fetchSessions();
      } else {
        alert('Failed to revoke other sessions.');
      }
    } catch {
      alert('Error revoking sessions.');
    } finally {
      setRevokingOthers(false);
    }
  };

  const formatAgent = (agentStr: string) => {
    if (!agentStr) return { name: 'Unknown Device', icon: Globe };
    const agent = agentStr.toLowerCase();
    
    // Quick user-agent parsers
    let icon = Monitor;
    let name = 'Desktop Device';

    if (agent.includes('mobi') || agent.includes('android') || agent.includes('iphone')) {
      icon = Smartphone;
      name = 'Mobile Device';
    }

    // Browsers
    let browser = 'Browser';
    if (agent.includes('chrome') || agent.includes('chromium')) browser = 'Chrome';
    else if (agent.includes('firefox')) browser = 'Firefox';
    else if (agent.includes('safari') && !agent.includes('chrome')) browser = 'Safari';
    else if (agent.includes('edge')) browser = 'Edge';

    // OS
    let os = 'OS';
    if (agent.includes('windows')) os = 'Windows';
    else if (agent.includes('macintosh') || agent.includes('mac os')) os = 'macOS';
    else if (agent.includes('linux')) os = 'Linux';
    else if (agent.includes('android')) os = 'Android';
    else if (agent.includes('iphone') || agent.includes('ipad')) os = 'iOS';

    return {
      name: `${name} (${browser} on ${os})`,
      icon,
    };
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Active Sessions</h2>
          <p className="text-sm text-slate-400">View and manage device sessions currently connected to your profile</p>
        </div>

        {sessions.length > 1 && (
          <button
            onClick={handleRevokeOthers}
            disabled={revokingOthers}
            className="inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-transparent border border-rose-500/30 hover:border-rose-500/60 text-rose-400 hover:bg-rose-950/15 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
          >
            <ShieldAlert className="h-4 w-4" />
            {revokingOthers ? 'Revoking...' : 'Log Out Other Devices'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/10 border border-slate-900 rounded-2xl">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-500"></div>
          <span className="mt-4 text-xs font-semibold text-slate-400">Loading session history...</span>
        </div>
      ) : error ? (
        <div className="p-6 text-center border border-rose-500/20 bg-rose-500/5 rounded-2xl text-rose-300">
          {error}
        </div>
      ) : (
        <div className="bg-slate-900/10 border border-slate-900 rounded-2xl overflow-hidden">
          <div className="divide-y divide-slate-900">
            {sessions.map((session) => {
              const isCurrent = session.id === currentSid;
              const { name: deviceName, icon: DeviceIcon } = formatAgent(session.userAgent);

              return (
                <div
                  key={session.id}
                  className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-colors hover:bg-slate-900/10"
                >
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-950 border border-slate-900 flex items-center justify-center text-slate-400">
                      <DeviceIcon className="h-5 w-5" />
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{deviceName}</span>
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                            <CheckCircle className="h-3 w-3" />
                            Current Session
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 border border-slate-700 text-slate-400">
                            Remote Session
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-x-4 gap-y-1 text-xs text-slate-500 flex-wrap font-mono">
                        <span>IP: {session.ipAddress}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Started: {new Date(session.createdAt).toLocaleDateString()} at {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {!isCurrent && (
                    <button
                      onClick={() => handleRevokeSession(session.id)}
                      disabled={revokingId === session.id}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl hover:bg-rose-950/20 hover:border-rose-900/30 text-xs font-semibold text-slate-400 hover:text-rose-400 transition-all shrink-0 cursor-pointer disabled:opacity-55"
                      title="Revoke session key"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      {revokingId === session.id ? 'Revoking...' : 'Revoke Session'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
