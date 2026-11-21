"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Webhook,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Send,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  X,
  History,
  Shield,
} from 'lucide-react';

interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  enabled: boolean;
  createdAt: string;
}

interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
}

export default function WebhooksPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);
  const [webhooksEnabled, setWebhooksEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  // New endpoint modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['*']);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Secret reveal
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);

  // Deliveries inspection modal
  const [inspectingEndpoint, setInspectingEndpoint] = useState<WebhookEndpoint | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [sendingTest, setSendingTest] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Delete modal
  const [deletingEndpoint, setDeletingEndpoint] = useState<WebhookEndpoint | null>(null);

  // Load projects
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await api.get('/projects');
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
          if (data.length > 0) {
            setSelectedProjectId(data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load projects', err);
      }
    }
    loadProjects();
  }, []);

  // Fetch endpoints and event types
  const fetchEndpoints = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const [epRes, evRes] = await Promise.all([
        api.get(`/projects/${selectedProjectId}/webhooks`),
        api.get(`/projects/${selectedProjectId}/webhooks/event-types`),
      ]);
      if (epRes.ok) {
        setEndpoints(await epRes.json());
      }
      if (evRes.ok) {
        const evData = await evRes.json();
        setAvailableEvents(evData.events || []);
        setWebhooksEnabled(evData.enabled);
      }
    } catch (err) {
      console.error('Failed to fetch webhooks', err);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    fetchEndpoints();
  }, [fetchEndpoints]);

  // Create endpoint
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim() || !selectedProjectId) return;
    setCreating(true);
    try {
      const res = await api.post(`/projects/${selectedProjectId}/webhooks`, {
        url: newUrl.trim(),
        description: newDescription.trim() || undefined,
        events: selectedEvents.length === 0 ? ['*'] : selectedEvents,
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedSecret(data.secret);
        setNewUrl('');
        setNewDescription('');
        setSelectedEvents(['*']);
        fetchEndpoints();
      }
    } catch (err) {
      console.error('Failed to create webhook', err);
    } finally {
      setCreating(false);
    }
  };

  // Toggle enabled
  const handleToggle = async (endpoint: WebhookEndpoint) => {
    try {
      const res = await api.patch(
        `/projects/${selectedProjectId}/webhooks/${endpoint.id}`,
        { enabled: !endpoint.enabled },
      );
      if (res.ok) {
        fetchEndpoints();
      }
    } catch (err) {
      console.error('Failed to toggle webhook', err);
    }
  };

  // Reveal secret
  const handleRevealSecret = async (endpointId: string) => {
    if (revealedSecrets[endpointId]) {
      const copy = { ...revealedSecrets };
      delete copy[endpointId];
      setRevealedSecrets(copy);
      return;
    }
    try {
      const res = await api.get(
        `/projects/${selectedProjectId}/webhooks/${endpointId}/secret`,
      );
      if (res.ok) {
        const data = await res.json();
        setRevealedSecrets((prev) => ({ ...prev, [endpointId]: data.secret }));
      }
    } catch (err) {
      console.error('Failed to reveal secret', err);
    }
  };

  // Send test
  const handleSendTest = async (endpointId: string) => {
    setSendingTest(endpointId);
    setTestResult(null);
    try {
      const res = await api.post(
        `/projects/${selectedProjectId}/webhooks/${endpointId}/test`,
      );
      if (res.ok) {
        setTestResult('Test webhook dispatched successfully!');
        if (inspectingEndpoint?.id === endpointId) {
          fetchDeliveries(endpointId);
        }
      } else {
        setTestResult('Failed to dispatch test event');
      }
    } catch (err) {
      setTestResult('Error dispatching test event');
    } finally {
      setSendingTest(null);
    }
  };

  // Fetch deliveries
  const fetchDeliveries = async (endpointId: string) => {
    setLoadingDeliveries(true);
    try {
      const res = await api.get(
        `/projects/${selectedProjectId}/webhooks/${endpointId}/deliveries`,
      );
      if (res.ok) {
        setDeliveries(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch deliveries', err);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  // Open deliveries inspector
  const handleInspectDeliveries = (endpoint: WebhookEndpoint) => {
    setInspectingEndpoint(endpoint);
    fetchDeliveries(endpoint.id);
  };

  // Delete endpoint
  const handleConfirmDelete = async () => {
    if (!deletingEndpoint) return;
    try {
      const res = await api.delete(
        `/projects/${selectedProjectId}/webhooks/${deletingEndpoint.id}`,
      );
      if (res.ok) {
        setDeletingEndpoint(null);
        fetchEndpoints();
      }
    } catch (err) {
      console.error('Failed to delete endpoint', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Webhook className="h-6 w-6 text-violet-400" />
            Customer Webhooks
          </h2>
          <p className="text-sm text-slate-400">
            Subscribe your external servers to realtime notification delivery events (SMS, email, gateway).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3.5 py-2 bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer min-w-[160px]"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={fetchEndpoints}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-all"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => {
              setCreatedSecret(null);
              setIsCreateOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-violet-600/20 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Webhook Endpoint
          </button>
        </div>
      </div>

      {/* Signing Security Notice */}
      <div className="p-4 rounded-2xl border border-violet-900/30 bg-violet-950/15 text-xs text-violet-300 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Shield className="h-4 w-4 shrink-0 text-violet-400" />
          <span>
            Every request includes a <code>Notica-Signature: t=&lt;ts&gt;,v1=&lt;hex&gt;</code> HMAC-SHA256 signature calculated over <code>&lt;ts&gt;.&lt;rawBody&gt;</code> with your endpoint secret.
          </span>
        </div>
        <span className="font-mono text-[10px] bg-violet-900/40 px-2 py-0.5 rounded text-white">
          HMAC-SHA256
        </span>
      </div>

      {/* Endpoints List */}
      {endpoints.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
          <Webhook className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">No Webhook Endpoints Configured</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-6">
            Add an HTTPS endpoint URL to receive delivery, bounce, or gateway status updates in your own backend.
          </p>
          <button
            onClick={() => {
              setCreatedSecret(null);
              setIsCreateOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add First Webhook
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {endpoints.map((ep) => {
            const secret = revealedSecrets[ep.id];
            return (
              <div
                key={ep.id}
                className={`p-5 rounded-2xl border transition-all ${
                  ep.enabled
                    ? 'bg-slate-900/40 border-slate-800'
                    : 'bg-slate-950/40 border-slate-900 opacity-60'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-sm text-slate-100">{ep.url}</span>
                      <button
                        onClick={() => handleToggle(ep)}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
                          ep.enabled
                            ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                            : 'border-slate-800 bg-slate-900 text-slate-500'
                        }`}
                      >
                        {ep.enabled ? 'Active' : 'Disabled'}
                      </button>
                    </div>
                    {ep.description && (
                      <p className="text-xs text-slate-400">{ep.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSendTest(ep.id)}
                      disabled={sendingTest === ep.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition-all"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {sendingTest === ep.id ? 'Sending...' : 'Send Test'}
                    </button>

                    <button
                      onClick={() => handleInspectDeliveries(ep)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition-all"
                    >
                      <History className="h-3.5 w-3.5" />
                      Logs
                    </button>

                    <button
                      onClick={() => setDeletingEndpoint(ep)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-850 transition-all"
                      title="Delete Endpoint"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Subscribed Events Badges */}
                <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-850/60">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mr-1">
                    Events:
                  </span>
                  {ep.events.map((evt) => (
                    <span
                      key={evt}
                      className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300"
                    >
                      {evt}
                    </span>
                  ))}
                </div>

                {/* Secret Reveal */}
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400 bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-500">Signing Secret:</span>
                    {secret ? (
                      <span className="font-mono text-emerald-400 text-xs">{secret}</span>
                    ) : (
                      <span className="font-mono text-slate-600 text-xs">whsec_••••••••••••••••••••••••••••••••</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRevealSecret(ep.id)}
                      className="text-slate-400 hover:text-slate-200 flex items-center gap-1 text-[11px]"
                    >
                      {secret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {secret ? 'Hide' : 'Reveal'}
                    </button>
                    {secret && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(secret);
                          setCopiedSecret(ep.id);
                          setTimeout(() => setCopiedSecret(null), 2000);
                        }}
                        className="text-slate-400 hover:text-emerald-400"
                        title="Copy Secret"
                      >
                        {copiedSecret === ep.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setIsCreateOpen(false)}
              className="absolute right-5 top-5 text-slate-500 hover:text-slate-300"
            >
              <X className="h-5 w-5" />
            </button>

            {!createdSecret ? (
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="flex items-center gap-2 text-violet-400">
                  <Webhook className="h-5 w-5" />
                  <h3 className="text-base font-bold text-white">Add Webhook Endpoint</h3>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Endpoint URL (HTTPS)
                  </label>
                  <input
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://api.yourdomain.com/webhooks/notica"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
                    autoFocus
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="e.g. Production Order Service"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Events to Send
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-950 rounded-xl border border-slate-850 text-xs">
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes('*')}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedEvents(['*']);
                          else setSelectedEvents([]);
                        }}
                        className="rounded border-slate-700 text-violet-600 focus:ring-0"
                      />
                      <span className="font-bold">All Events (*)</span>
                    </label>

                    {availableEvents
                      .filter((e) => e !== '*')
                      .map((evt) => {
                        const checked = selectedEvents.includes(evt) || selectedEvents.includes('*');
                        return (
                          <label key={evt} className="flex items-center gap-2 text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={selectedEvents.includes('*')}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedEvents([...selectedEvents.filter((x) => x !== '*'), evt]);
                                } else {
                                  setSelectedEvents(selectedEvents.filter((x) => x !== evt));
                                }
                              }}
                              className="rounded border-slate-700 text-violet-600 focus:ring-0"
                            />
                            <span className="font-mono text-[11px]">{evt}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !newUrl.trim()}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-violet-600/20"
                  >
                    {creating ? 'Creating...' : 'Create Endpoint'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-center">
                <div className="flex items-center justify-center gap-2 text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" />
                  <h3 className="text-base font-bold text-white">Endpoint Registered</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Here is your signing secret for verifying signatures in incoming payloads.
                </p>

                <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
                  <span className="font-mono text-emerald-400 text-xs truncate max-w-xs">{createdSecret}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdSecret);
                      setCopiedSecret('modal');
                      setTimeout(() => setCopiedSecret(null), 2000);
                    }}
                    className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900"
                  >
                    {copiedSecret === 'modal' ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      setIsCreateOpen(false);
                      setCreatedSecret(null);
                    }}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-xl"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deliveries Inspection Modal */}
      {inspectingEndpoint && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative max-h-[85vh] flex flex-col">
            <button
              onClick={() => setInspectingEndpoint(null)}
              className="absolute right-5 top-5 text-slate-500 hover:text-slate-300"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 text-violet-400">
              <History className="h-5 w-5" />
              <h3 className="text-base font-bold text-white">
                Recent Deliveries: {inspectingEndpoint.url}
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {loadingDeliveries ? (
                <div className="text-center py-8 text-xs text-slate-500">Loading deliveries...</div>
              ) : deliveries.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No delivery attempts recorded yet.
                </div>
              ) : (
                deliveries.map((del) => (
                  <div
                    key={del.id}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-850 text-xs flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-bold text-slate-200">{del.eventType}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                            del.status === 'SUCCESS'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : del.status === 'FAILED'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {del.status} {del.lastStatusCode ? `(${del.lastStatusCode})` : ''}
                        </span>
                      </div>
                      {del.lastError && (
                        <p className="text-[11px] text-rose-400 font-mono">{del.lastError}</p>
                      )}
                    </div>
                    <div className="text-right text-[11px] text-slate-500 font-mono">
                      <div>Attempts: {del.attempts}</div>
                      <div>{new Date(del.createdAt).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setInspectingEndpoint(null)}
                className="px-4 py-2 bg-slate-800 text-slate-200 text-xs font-semibold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingEndpoint && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/40 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-sm font-bold text-white">Delete Webhook Endpoint?</h3>
            </div>
            <p className="text-xs text-slate-400">
              Are you sure you want to remove <strong>{deletingEndpoint.url}</strong>? It will no longer receive any webhook events.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingEndpoint(null)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
