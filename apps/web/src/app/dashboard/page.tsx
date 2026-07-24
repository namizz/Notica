"use client";

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, KeyRound, Layers, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { ProjectCard } from '@/components/ProjectCard';

interface Project {
  id: string;
  name: string;
  apiKeyPrefix: string;
  createdAt: string;
}

interface ProjectWithRawKey extends Project {
  apiKey: string;
}

interface OneTimeKey {
  projectName: string;
  value: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotatingName, setRotatingName] = useState<string | null>(null);
  const [confirmRotateOpen, setConfirmRotateOpen] = useState(false);
  const [isRotateLoading, setIsRotateLoading] = useState(false);
  const [oneTimeKey, setOneTimeKey] = useState<OneTimeKey | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  const fetchProjects = async () => {
    try {
      const response = await api.get('/projects');
      if (!response.ok) {
        setError('Failed to fetch projects.');
        return;
      }

      setProjects((await response.json()) as Project[]);
      setError(null);
    } catch {
      setError('An error occurred while loading projects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initializationTimer = window.setTimeout(() => {
      void fetchProjects();

      const pendingKey = sessionStorage.getItem('notica:new-api-key');
      if (pendingKey) {
        sessionStorage.removeItem('notica:new-api-key');

        try {
          const parsed = JSON.parse(pendingKey) as {
            projectName: string;
            apiKey: string;
          };
          setOneTimeKey({
            projectName: parsed.projectName,
            value: parsed.apiKey,
          });
        } catch {
          // Never retain malformed one-time credential state.
        }
      }
    }, 0);

    return () => window.clearTimeout(initializationTimer);
  }, []);

  const showNewKey = (project: ProjectWithRawKey) => {
    setOneTimeKey({
      projectName: project.name,
      value: project.apiKey,
    });
    setKeyCopied(false);
  };

  const handleCreateProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const response = await api.post('/projects', { name: newProjectName });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        alert(body.message || 'Failed to create project.');
        return;
      }

      const project = (await response.json()) as ProjectWithRawKey;
      setNewProjectName('');
      setShowCreateModal(false);
      showNewKey(project);
      await fetchProjects();
    } catch {
      alert('Error creating project.');
    } finally {
      setCreating(false);
    }
  };

  const handleRotateKey = async () => {
    if (!rotatingId) return;

    setIsRotateLoading(true);
    try {
      const response = await api.post(`/projects/${rotatingId}/rotate-key`);
      if (!response.ok) {
        alert('Failed to rotate API key.');
        return;
      }

      const project = (await response.json()) as ProjectWithRawKey;
      setConfirmRotateOpen(false);
      setRotatingId(null);
      setRotatingName(null);
      showNewKey(project);
      await fetchProjects();
    } catch {
      alert('Error rotating API key.');
    } finally {
      setIsRotateLoading(false);
    }
  };

  const copyOneTimeKey = async () => {
    if (!oneTimeKey) return;
    await navigator.clipboard.writeText(oneTimeKey.value);
    setKeyCopied(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Projects & API Keys</h2>
          <p className="text-sm text-slate-400">Manage environments and server-side integration keys</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-semibold text-white transition-all shadow-md shadow-violet-600/10 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Create New Project
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/10 border border-slate-900 rounded-2xl">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-500" />
          <span className="mt-4 text-xs font-semibold text-slate-400">Loading projects...</span>
        </div>
      ) : error ? (
        <div className="p-6 text-center border border-rose-500/20 bg-rose-500/5 rounded-2xl text-rose-300">
          {error}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center p-12 bg-slate-900/20 border border-slate-900 rounded-2xl space-y-4">
          <Layers className="h-10 w-10 text-slate-500 mx-auto" />
          <h3 className="text-md font-semibold text-slate-300">No Projects Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Create a project to start dispatching notifications.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onRotateRequest={(id, name) => {
                setRotatingId(id);
                setRotatingName(name);
                setConfirmRotateOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Create New Project</h3>
            <p className="text-xs text-slate-400 mb-6">
              The API key will be displayed once after creation.
            </p>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="Production Environment"
                  className="block w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newProjectName.trim()}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmRotateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="h-10 w-10 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl flex items-center justify-center">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Rotate API Key?</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Rotating the key for <strong className="text-slate-200">{rotatingName}</strong> immediately
                revokes the current key. The replacement will be shown only once.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmRotateOpen(false)}
                disabled={isRotateLoading}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRotateKey}
                disabled={isRotateLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
              >
                {isRotateLoading ? 'Rotating...' : 'Confirm Rotation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {oneTimeKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-violet-500/30 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 bg-violet-500/10 text-violet-400 rounded-xl flex items-center justify-center shrink-0">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Save your API key now</h3>
                <p className="text-xs text-amber-300 mt-1">
                  This is the only time Notica will display the complete key for {oneTimeKey.projectName}.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3">
              <code className="flex-1 text-xs text-violet-300 break-all">{oneTimeKey.value}</code>
              <button
                type="button"
                onClick={copyOneTimeKey}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                title="Copy API key"
              >
                {keyCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setOneTimeKey(null)}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl"
              >
                I have saved this key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
