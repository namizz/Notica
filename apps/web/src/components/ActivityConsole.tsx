import React from 'react';
import { Terminal, Trash } from 'lucide-react';

export interface ConsoleLog {
  timestamp: Date;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  notificationId?: string;
  recipientId?: string;
  channel?: string;
}

interface Project {
  id: string;
  name: string;
  apiKey: string;
  createdAt: string;
}

interface ActivityConsoleProps {
  projects: Project[];
  selectedLogProjectId: string;
  setSelectedLogProjectId: (id: string) => void;
  isConsoleConnected: boolean;
  consoleLogs: ConsoleLog[];
  onClearLogs: () => void;
}

export function ActivityConsole({
  projects,
  selectedLogProjectId,
  setSelectedLogProjectId,
  isConsoleConnected,
  consoleLogs,
  onClearLogs
}: ActivityConsoleProps) {
  return (
    <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden mt-8 shadow-2xl">
      {/* Console Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-900/40 border-b border-slate-900 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600/10 border border-violet-500/20 text-violet-400">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Real-time Activity Console</h3>
            <p className="text-[10px] text-slate-400">Stream notification logs and delivery statuses as they happen</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Project selector dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Project:</span>
            <select
              value={selectedLogProjectId}
              onChange={(e) => setSelectedLogProjectId(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 font-semibold focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl">
            <span className={`h-2.5 w-2.5 rounded-full ${isConsoleConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
            <span className="text-[11px] font-semibold text-slate-400">
              {isConsoleConnected ? 'Live Connection Active' : 'Disconnected'}
            </span>
          </div>

          {/* Clear logs button */}
          <button
            type="button"
            onClick={onClearLogs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
            title="Clear Logs"
          >
            <Trash className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Console Output */}
      <div className="p-6 font-mono text-xs overflow-y-auto max-h-[320px] min-h-[160px] bg-slate-950/80 space-y-3 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {consoleLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
            <Terminal className="h-6 w-6 text-slate-600" />
            <span>Waiting for notifications... Trigger an alert from the mock store to see logs.</span>
          </div>
        ) : (
          consoleLogs.map((log, index) => {
            let badgeColor = 'bg-slate-800 text-slate-400';
            if (log.type === 'success') badgeColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
            if (log.type === 'error') badgeColor = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
            if (log.type === 'warning') badgeColor = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
            if (log.type === 'info') badgeColor = 'bg-violet-500/10 text-violet-400 border border-violet-500/20';

            return (
              <div key={index} className="flex items-start gap-4 border-b border-slate-900/50 pb-2.5 last:border-b-0 last:pb-0">
                <span className="text-[10px] text-slate-500 select-none shrink-0 mt-0.5">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide shrink-0 ${badgeColor}`}>
                  {log.type.toUpperCase()}
                </span>
                <div className="flex-1 space-y-1">
                  <p className="text-slate-300 break-all leading-relaxed">{log.message}</p>
                  {(log.notificationId || log.recipientId || log.channel) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
                      {log.notificationId && (
                        <span>
                          ID: <strong className="text-slate-400 font-medium">{log.notificationId.substring(0, 8)}</strong>
                        </span>
                      )}
                      {log.recipientId && (
                        <span>
                          Recipient: <strong className="text-slate-400 font-medium">{log.recipientId}</strong>
                        </span>
                      )}
                      {log.channel && (
                        <span>
                          Channel: <strong className="text-slate-400 font-medium">{log.channel}</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
