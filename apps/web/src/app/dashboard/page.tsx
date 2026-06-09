"use client";

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { Layers, Plus, AlertTriangle, Terminal } from 'lucide-react';
import { ProjectCard } from '@/components/ProjectCard';

interface Project {
  id: string;
  name: string;
  apiKey: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Project Form
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Newly revealed keys state
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Rotate Key Confirmation Modal (Simple Confirmation)
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotatingName, setRotatingName] = useState<string | null>(null);
  const [confirmRotateOpen, setConfirmRotateOpen] = useState(false);
  const [isRotateLoading, setIsRotateLoading] = useState(false);

  // 2FA Reveal Modal states
  const [revealProjectId, setRevealProjectId] = useState<string | null>(null);
  const [revealCode, setRevealCode] = useState('');
  const [revealError, setRevealError] = useState<string | null>(null);
  const [isRevealLoading, setIsRevealLoading] = useState(false);



  const fetchProjects = async () => {
    try {
      const res = await api.get('/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
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



  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const res = await api.post('/projects', { name: newProjectName });
      if (res.ok) {
        setNewProjectName('');
        setShowCreateModal(false);
        fetchProjects();
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to create project.');
      }
    } catch (e) {
      alert('Error creating project.');
    } finally {
      setCreating(false);
    }
  };

  const handleRotateKey = async () => {
    if (!rotatingId) return;

    setIsRotateLoading(true);
    try {
      const res = await api.post(`/projects/${rotatingId}/rotate-key`);
      if (res.ok) {
        setConfirmRotateOpen(false);
        setRotatingId(null);
        setRotatingName(null);
        setRevealedKeys((prev) => {
          const next = { ...prev };
          delete next[rotatingId];
          return next;
        });
        fetchProjects();
      } else {
        alert('Failed to rotate API Key.');
      }
    } catch (e) {
      alert('Error rotating API Key.');
    } finally {
      setIsRotateLoading(false);
    }
  };

  const handleRevealKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revealProjectId) return;

    setIsRevealLoading(true);
    setRevealError(null);
    try {
      const res = await api.post(`/projects/${revealProjectId}/reveal`, {
        code: revealCode,
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedKeys((prev) => ({ ...prev, [revealProjectId]: data.apiKey }));
        setRevealProjectId(null);
        setRevealCode('');
      } else {
        const err = await res.json();
        setRevealError(err.message || 'Verification failed. Please try again.');
      }
    } catch (e) {
      setRevealError('An error occurred during verification.');
    } finally {
      setIsRevealLoading(false);
    }
  };

  const toggleKeyVisibility = (projectId: string) => {
    if (revealedKeys[projectId]) {
      setRevealedKeys((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
    } else {
      setRevealProjectId(projectId);
      setRevealCode('');
      setRevealError(null);
    }
  };

  const copyToClipboard = (projectId: string) => {
    const rawKey = revealedKeys[projectId];
    if (rawKey) {
      navigator.clipboard.writeText(rawKey);
      setCopiedKeyId(projectId);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } else {
      setRevealProjectId(projectId);
      setRevealCode('');
      setRevealError(null);
    }
  };

  const handleRotateRequest = (id: string, name: string) => {
    setRotatingId(id);
    setRotatingName(name);
    setConfirmRotateOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Projects & API Keys</h2>
          <p className="text-sm text-slate-400">Manage environments and copy live keys for SDK integrations</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-semibold text-white transition-all shadow-md shadow-violet-600/10 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Create New Project
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/10 border border-slate-900 rounded-2xl">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-500"></div>
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
          <p className="text-xs text-slate-500 max-w-sm mx-auto">Create a project to start dispatching push and realtime notifications.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-semibold cursor-pointer"
          >
            Create one now <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="grid gap-6">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              revealedKey={revealedKeys[project.id]}
              copiedKeyId={copiedKeyId}
              toggleKeyVisibility={toggleKeyVisibility}
              copyToClipboard={copyToClipboard}
              onRotateRequest={handleRotateRequest}
            />
          ))}
        </div>
      )}



      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white mb-2">Create New Project</h3>
            <p className="text-xs text-slate-400 mb-6">Create separate environments or workspaces (e.g. Production, Staging)</p>
            
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
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Production Environment"
                  className="block w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewProjectName('');
                  }}
                  className="px-4 py-2 bg-transparent text-slate-400 hover:text-slate-200 text-sm font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newProjectName.trim()}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-violet-600/10 disabled:opacity-50 cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Rotate Modal */}
      {confirmRotateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <div className="h-10 w-10 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl flex items-center justify-center">
              <AlertTriangle className="h-5 w-5" />
            </div>
            
            <div>
              <h3 className="text-lg font-bold text-white">Rotate API Key?</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Rotating the API Key for <strong className="text-slate-200">{rotatingName}</strong> will immediately revoke the current key. Any active client SDK integrations using this key will immediately fail authentication.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-900">
              <button
                type="button"
                onClick={() => {
                  setConfirmRotateOpen(false);
                  setRotatingId(null);
                  setRotatingName(null);
                }}
                className="px-4 py-2 bg-transparent text-slate-400 hover:text-slate-200 text-sm font-semibold rounded-xl"
                disabled={isRotateLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRotateKey}
                disabled={isRotateLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-rose-600/10 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isRotateLoading ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border border-white/20 border-t-white"></div>
                    Rotating...
                  </>
                ) : (
                  'Confirm Rotation'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2FA Reveal Verification Modal */}
      {revealProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <div className="h-10 w-10 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-xl flex items-center justify-center">
              <Terminal className="h-5 w-5" />
            </div>
            
            <div>
              <h3 className="text-lg font-bold text-white">Reveal API Key</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                For security, you must verify your identity to reveal this API key.
              </p>
            </div>

            <form onSubmit={handleRevealKey} className="space-y-4">
              {!user?.isTwoFactorEnabled ? (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200 text-xs leading-normal">
                  <p className="font-bold text-white mb-1">Two-Factor Authentication Required</p>
                  You must enable Two-Factor Authentication (2FA) in your Security settings to reveal API keys.
                  <div className="mt-2.5">
                    <Link
                      href="/dashboard/security"
                      className="inline-flex items-center text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      Enable 2FA in Security Settings &rarr;
                    </Link>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    2FA Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={revealCode}
                    onChange={(e) => setRevealCode(e.target.value)}
                    placeholder="000000"
                    className="block w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all text-sm font-mono tracking-widest text-center"
                    maxLength={6}
                  />
                </div>
              )}

              {revealError && (
                <p className="text-xs text-rose-400 font-semibold">{revealError}</p>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => {
                    setRevealProjectId(null);
                    setRevealCode('');
                    setRevealError(null);
                  }}
                  className="px-4 py-2 bg-transparent text-slate-400 hover:text-slate-200 text-sm font-semibold rounded-xl"
                  disabled={isRevealLoading}
                >
                  Cancel
                </button>
                {user?.isTwoFactorEnabled && (
                  <button
                    type="submit"
                    disabled={isRevealLoading || !revealCode}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-violet-600/10 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isRevealLoading ? (
                      <>
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border border-white/20 border-t-white"></div>
                        Verifying...
                      </>
                    ) : (
                      'Reveal Key'
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
