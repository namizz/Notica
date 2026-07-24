"use client";

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { 
  Search, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Info, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  Terminal,
  Send,
  Smartphone,
  Laptop
} from 'lucide-react';

interface RecipientUser {
  externalUserId: string;
  name: string | null;
  email: string | null;
}

interface DeliveryAttempt {
  id: string;
  provider: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'SIMULATED';
  attemptCount: number;
  errorMessage: string | null;
  sentAt: string | null;
}

interface NotificationLog {
  id: string;
  title: string;
  body: string;
  channel: 'IN_APP' | 'WEB_PUSH' | 'EMAIL';
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'FAILED';
  createdAt: string;
  recipientUser: RecipientUser;
  deliveries: DeliveryAttempt[];
}

interface Project {
  id: string;
  name: string;
}

export default function DeliveryLogsPage() {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [channel, setChannel] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Selected Notification for Detail Drawer
  const [selectedLog, setSelectedLog] = useState<NotificationLog | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page on search
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void api.get('/projects').then(async (response) => {
      if (!response.ok) {
        setError('Failed to load projects.');
        setLoading(false);
        return;
      }

      const projectList = (await response.json()) as Project[];
      setProjects(projectList);
      setSelectedProjectId((current) => current || projectList[0]?.id || '');
      if (projectList.length === 0) setLoading(false);
    });
  }, []);

  const fetchLogs = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: '15',
        projectId: selectedProjectId,
      });
      if (status) queryParams.append('status', status);
      if (channel) queryParams.append('channel', channel);
      if (debouncedSearch) queryParams.append('search', debouncedSearch);

      const res = await api.get(`/notifications?${queryParams.toString()}`);
      if (res.ok) {
        const result = await res.json();
        setLogs(result.data || []);
        setTotal(result.total || 0);
        setTotalPages(result.totalPages || 1);
      } else {
        setError('Failed to fetch delivery logs.');
      }
    } catch (err) {
      setError('An error occurred while loading logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, status, channel, debouncedSearch, selectedProjectId]);

  const getStatusBadge = (logStatus: string) => {
    switch (logStatus) {
      case 'DELIVERED':
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" />
            {logStatus}
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="h-3 w-3" />
            FAILED
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
            <Clock className="h-3 w-3" />
            PROCESSING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="h-3 w-3" />
            {logStatus}
          </span>
        );
    }
  };

  const getChannelBadge = (logChannel: string) => {
    if (logChannel === 'WEB_PUSH') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-indigo-400">
          <Laptop className="h-3.5 w-3.5" />
          Web Push
        </span>
      );
    }
    if (logChannel === 'EMAIL') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
          <Send className="h-3.5 w-3.5" />
          Email
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-sky-400">
        <Send className="h-3.5 w-3.5" />
        In-App
      </span>
    );
  };

  const getDeliveryStatusIcon = (attemptStatus: string) => {
    if (attemptStatus === 'SUCCESS') {
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    }
    if (attemptStatus === 'FAILED') {
      return <AlertCircle className="h-4 w-4 text-rose-400" />;
    }
    return <Clock className="h-4 w-4 text-amber-400" />;
  };

  return (
    <div className="space-y-6 relative min-h-[70vh]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Notification Delivery Logs</h2>
          <p className="text-sm text-slate-400">Browse history, inspect payloads, and trace routing attempts</p>
        </div>
        <button
          onClick={fetchLogs}
          className="inline-flex items-center justify-center gap-2 py-2 px-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch bg-slate-900/10 border border-slate-900 p-4 rounded-2xl">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, body content, or recipient user ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-850 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filters Selectors */}
        <div className="flex flex-wrap sm:flex-nowrap gap-3 items-stretch">
          <select
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-950/60 border border-slate-850 text-slate-300 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer min-w-[150px]"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          <select
            value={channel}
            onChange={(e) => { setChannel(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-slate-950/60 border border-slate-850 text-slate-300 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer min-w-[120px]"
          >
            <option value="">All Channels</option>
            <option value="IN_APP">In-App</option>
            <option value="WEB_PUSH">Web Push</option>
            <option value="EMAIL">Email</option>
          </select>

          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-slate-950/60 border border-slate-850 text-slate-300 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer min-w-[140px]"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="SENT">SENT</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>
      </div>

      {/* Main logs display */}
      {error ? (
        <div className="p-6 text-center border border-rose-500/20 bg-rose-500/5 rounded-2xl text-rose-300">
          {error}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center p-16 bg-slate-900/10 border border-slate-900/60 rounded-2xl space-y-4">
          <Terminal className="h-10 w-10 text-slate-500 mx-auto" />
          <h3 className="text-md font-semibold text-slate-300">No Delivery Logs Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {search || status || channel
              ? "No notifications match your active search filters. Try clearing them."
              : "No notifications have been dispatched yet. Place orders from the mock storefront to send events."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto border border-slate-900/80 bg-slate-950/20 rounded-2xl">
            <table className="w-full border-collapse text-left text-sm text-slate-300">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-900/20 text-slate-400 text-xs font-semibold">
                  <th className="px-6 py-4">Created At</th>
                  <th className="px-6 py-4">Recipient</th>
                  <th className="px-6 py-4">Notification Title</th>
                  <th className="px-6 py-4">Channel</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/50">
                {logs.map((log) => (
                  <tr 
                    key={log.id} 
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-slate-900/20 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4 text-xs font-mono text-slate-450 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-200">
                      {log.recipientUser.externalUserId}
                    </td>
                    <td className="px-6 py-4 max-w-[260px] truncate text-slate-200" title={log.title}>
                      {log.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getChannelBadge(log.channel)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(log.status)}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <button className="text-xs font-semibold text-violet-400 hover:text-violet-300 group-hover:underline cursor-pointer">
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-slate-400">
                Showing logs <span className="font-semibold text-slate-350">{(page-1)*15 + 1}</span> to <span className="font-semibold text-slate-350">{Math.min(page*15, total)}</span> of <span className="font-semibold text-slate-350">{total}</span> total
              </span>

              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="inline-flex items-center justify-center p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:hover:text-slate-400 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="inline-flex items-center px-4 rounded-xl border border-slate-800 bg-slate-950/40 text-xs font-medium text-slate-300">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                  disabled={page === totalPages}
                  className="inline-flex items-center justify-center p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:hover:text-slate-400 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Slide-over Inspection Panel */}
      {selectedLog && (
        <div 
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setSelectedLog(null)}
        >
          <div 
            className="w-full max-w-xl bg-slate-950 border-l border-slate-900 h-full overflow-y-auto p-6 shadow-2xl flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-900">
                <div>
                  <span className="text-[10px] font-bold text-violet-400 tracking-wider uppercase">Log Trace</span>
                  <h3 className="text-lg font-bold text-white mt-1">Notification Inspector</h3>
                </div>
                <button 
                  onClick={() => setSelectedLog(null)}
                  className="p-2 text-slate-500 hover:text-slate-200 hover:bg-slate-900 rounded-xl transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* General Metadata */}
              <div className="grid grid-cols-2 gap-4 bg-slate-900/10 border border-slate-900/60 p-4 rounded-2xl">
                <div>
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Channel</span>
                  <div className="mt-1 font-semibold">{getChannelBadge(selectedLog.channel)}</div>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</span>
                  <div className="mt-1">{getStatusBadge(selectedLog.status)}</div>
                </div>
                <div className="col-span-2">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Created At</span>
                  <span className="block text-xs text-slate-300 mt-1 font-mono">
                    {new Date(selectedLog.createdAt).toLocaleString(undefined, {
                      dateStyle: 'full',
                      timeStyle: 'medium'
                    })}
                  </span>
                </div>
              </div>

              {/* Recipient Details */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recipient Profile</h4>
                <div className="bg-slate-900/20 border border-slate-900/50 rounded-2xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-550">External User ID:</span>
                    <span className="font-mono font-bold text-slate-200">{selectedLog.recipientUser.externalUserId}</span>
                  </div>
                  {selectedLog.recipientUser.name && (
                    <div className="flex justify-between">
                      <span className="text-slate-550">Name:</span>
                      <span className="text-slate-200">{selectedLog.recipientUser.name}</span>
                    </div>
                  )}
                  {selectedLog.recipientUser.email && (
                    <div className="flex justify-between">
                      <span className="text-slate-550">Email Address:</span>
                      <span className="text-slate-200">{selectedLog.recipientUser.email}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Message Payload */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Message Payload</h4>
                <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4 space-y-2">
                  <div className="text-sm font-bold text-white leading-snug">
                    {selectedLog.title}
                  </div>
                  <div className="text-xs text-slate-400 leading-relaxed leading-snug">
                    {selectedLog.body}
                  </div>
                </div>
              </div>

              {/* Delivery Attempts */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Delivery Routing Log</h4>
                {selectedLog.deliveries.length === 0 ? (
                  <div className="flex items-center gap-2.5 p-4 border border-amber-500/10 bg-amber-500/5 rounded-2xl text-xs text-amber-300">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>No delivery logs found. The message is waiting in the delivery queue.</span>
                  </div>
                ) : (
                  <div className="relative border-l-2 border-slate-900 ml-3.5 space-y-6">
                    {selectedLog.deliveries.map((delivery, index) => (
                      <div key={delivery.id} className="relative pl-6">
                        {/* Dot */}
                        <div className="absolute -left-[9px] top-1 bg-slate-950 p-0.5 rounded-full">
                          {getDeliveryStatusIcon(delivery.status)}
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-200">
                              Attempt #{delivery.attemptCount} ({delivery.provider})
                            </span>
                            {delivery.sentAt && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                {new Date(delivery.sentAt).toLocaleTimeString()}
                              </span>
                            )}
                          </div>
                          
                          <span className={`inline-block text-[10px] font-semibold py-0.5 px-1.5 rounded-md ${
                            delivery.status === 'SUCCESS' 
                              ? 'bg-emerald-500/10 text-emerald-400' 
                              : (delivery.status === 'FAILED' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400')
                          }`}>
                            {delivery.status}
                          </span>

                          {delivery.errorMessage && (
                            <div className="mt-2 p-2.5 bg-rose-500/5 border border-rose-550/10 rounded-xl text-[10px] font-mono text-rose-350 leading-relaxed break-words">
                              {delivery.errorMessage}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-8 pt-4 border-t border-slate-900 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="py-2 px-4 bg-slate-900 hover:bg-slate-850 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
