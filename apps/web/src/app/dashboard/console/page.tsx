"use client";

import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { io } from 'socket.io-client';
import { ActivityConsole, ConsoleLog } from '@/components/ActivityConsole';
import { Terminal, Activity } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  apiKey: string;
  createdAt: string;
}

export default function RealTimeConsolePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real-time Console Log Feed
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [selectedLogProjectId, setSelectedLogProjectId] = useState<string>('');
  const [isConsoleConnected, setIsConsoleConnected] = useState(false);
  const socketRef = useRef<any>(null);

  const fetchProjects = async () => {
    try {
      const res = await api.get('/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        if (data.length > 0 && !selectedLogProjectId) {
          setSelectedLogProjectId(data[0].id);
        }
      } else {
        setError('Failed to fetch projects.');
      }
    } catch (e) {
      setError('An error occurred while loading projects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    const activeProject = projects.find(p => p.id === selectedLogProjectId);
    if (!activeProject) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConsoleConnected(false);
      }
      return;
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000';
    console.log(`[Dashboard Console] Connecting to logs stream for project: ${activeProject.name}`);

    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socket = io(`${wsUrl}/realtime`, {
      query: {
        apiKey: activeProject.apiKey,
        recipientId: 'dashboard',
      },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConsoleConnected(true);
      setConsoleLogs(prev => [
        {
          timestamp: new Date(),
          type: 'info',
          message: `Connected to live activity log stream for project: "${activeProject.name}"`
        },
        ...prev
      ]);
    });

    socket.on('log_event', (logData: any) => {
      setConsoleLogs(prev => [
        {
          timestamp: new Date(logData.timestamp),
          type: logData.type,
          message: logData.message,
          notificationId: logData.notificationId,
          recipientId: logData.recipientId,
          channel: logData.channel,
        },
        ...prev
      ]);
    });

    socket.on('disconnect', () => {
      setIsConsoleConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[Dashboard Console] Socket connection error:', err);
      setConsoleLogs(prev => [
        {
          timestamp: new Date(),
          type: 'error',
          message: `Connection error: ${err.message}`
        },
        ...prev
      ]);
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [selectedLogProjectId, projects]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-violet-400">
            <Activity className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-widest">Real-time Stream</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white mt-1">Activity Console</h2>
          <p className="text-sm text-slate-400">Monitor live notification dispatches, WebSocket events, and delivery attempts</p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/10 border border-slate-900 rounded-2xl">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-500"></div>
          <span className="mt-4 text-xs font-semibold text-slate-400">Loading console...</span>
        </div>
      ) : error ? (
        <div className="p-6 text-center border border-rose-500/20 bg-rose-500/5 rounded-2xl text-rose-300">
          {error}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center p-12 bg-slate-900/20 border border-slate-900 rounded-2xl space-y-4">
          <Terminal className="h-10 w-10 text-slate-500 mx-auto" />
          <h3 className="text-md font-semibold text-slate-300">No Projects Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">Create a project on the main page to start monitoring live activity.</p>
        </div>
      ) : (
        <div className="bg-slate-950/40 border border-slate-900 p-1.5 rounded-2xl">
          <ActivityConsole
            projects={projects}
            selectedLogProjectId={selectedLogProjectId}
            setSelectedLogProjectId={setSelectedLogProjectId}
            isConsoleConnected={isConsoleConnected}
            consoleLogs={consoleLogs}
            onClearLogs={() => setConsoleLogs([])}
          />
        </div>
      )}
    </div>
  );
}
