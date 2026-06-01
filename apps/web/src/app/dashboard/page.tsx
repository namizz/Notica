"use client";

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Layers, Plus, RotateCw, Copy, Check, Eye, EyeOff, AlertTriangle, Terminal, Code } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  apiKey: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Project Form
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Key visibility & Copy Status
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Rotate Key Confirmation Modal
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotatingName, setRotatingName] = useState<string | null>(null);
  const [confirmRotateOpen, setConfirmRotateOpen] = useState(false);

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

    try {
      const res = await api.post(`/projects/${rotatingId}/rotate-key`);
      if (res.ok) {
        setConfirmRotateOpen(false);
        setRotatingId(null);
        setRotatingName(null);
        fetchProjects();
      } else {
        alert('Failed to rotate API Key.');
      }
    } catch (e) {
      alert('Error rotating API Key.');
    }
  };

  const toggleKeyVisibility = (projectId: string) => {
    setVisibleKeys((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
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
          className="inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-semibold text-white transition-all shadow-md shadow-violet-600/10"
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
            className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-semibold"
          >
            Create one now <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="grid gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-slate-900/30 border border-slate-900 rounded-2xl p-6 relative overflow-hidden"
            >
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">{project.name}</h3>
                  <p className="text-[10px] text-slate-500 font-mono">ID: {project.id}</p>
                </div>
                
                <button
                  onClick={() => {
                    setRotatingId(project.id);
                    setRotatingName(project.name);
                    setConfirmRotateOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl hover:bg-rose-950/20 hover:border-rose-900/30 text-xs font-semibold text-slate-400 hover:text-rose-200 transition-all cursor-pointer"
                >
                  <RotateCw className="h-3 w-3" />
                  Rotate Key
                </button>
              </div>

              {/* API Key Panel */}
              <div className="mt-6 space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Live API Key
                </label>
                <div className="flex items-center gap-2 max-w-2xl bg-slate-950 border border-slate-900 rounded-xl px-4 py-3">
                  <div className="flex-1 font-mono text-xs select-all break-all pr-2 tracking-wide text-violet-300">
                    {visibleKeys[project.id] ? project.apiKey : '••••••••••••••••••••••••••••••••••••••••••••••••'}
                  </div>
                  
                  <div className="flex items-center gap-1 shrink-0 border-l border-slate-900 pl-2">
                    <button
                      onClick={() => toggleKeyVisibility(project.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                      title={visibleKeys[project.id] ? "Hide Key" : "Show Key"}
                    >
                      {visibleKeys[project.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(project.apiKey, project.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                      title="Copy to Clipboard"
                    >
                      {copiedKeyId === project.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Code Integration Panel */}
              <div className="mt-6 border-t border-slate-900 pt-6">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3">
                  <Code className="h-4 w-4 text-violet-400" />
                  <span>Integration snippet (Node.js SDK)</span>
                </div>
                <div className="relative bg-slate-950 rounded-xl p-4 border border-slate-900 font-mono text-[11px] text-slate-300 leading-relaxed overflow-x-auto">
                  <span className="text-slate-500">// Initialize SDK client</span>
                  <br />
                  <span className="text-violet-400">const</span> notica = require(<span className="text-emerald-400">&apos;@notica/node&apos;</span>).init(<span className="text-emerald-400">&apos;{project.apiKey}&apos;</span>);
                  <br />
                  <br />
                  <span className="text-slate-500">// Notify a stateful recipient instantly</span>
                  <br />
                  <span className="text-violet-400">await</span> notica.notify(&apos;user_123&apos;, &#123;
                  <br />
                  &nbsp;&nbsp;title: <span className="text-emerald-400">&apos;Alert triggered&apos;</span>,
                  <br />
                  &nbsp;&nbsp;body: <span className="text-emerald-400">&apos;Service threshold exceeded by 15%&apos;</span>,
                  <br />
                  &nbsp;&nbsp;channel: <span className="text-emerald-400">&apos;in_app&apos;</span>
                  <br />
                  &#125;);
                </div>
              </div>
            </div>
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
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-violet-600/10 disabled:opacity-50"
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
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRotateKey}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-rose-600/10"
              >
                Confirm Rotation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
