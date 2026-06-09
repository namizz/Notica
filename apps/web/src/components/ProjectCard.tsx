import React from 'react';
import { RotateCw, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { IntegrationGuide } from './IntegrationGuide';

interface Project {
  id: string;
  name: string;
  apiKey: string;
  createdAt: string;
}

interface ProjectCardProps {
  project: Project;
  revealedKey: string | undefined;
  copiedKeyId: string | null;
  toggleKeyVisibility: (id: string) => void;
  copyToClipboard: (id: string) => void;
  onRotateRequest: (id: string, name: string) => void;
}

export function ProjectCard({
  project,
  revealedKey,
  copiedKeyId,
  toggleKeyVisibility,
  copyToClipboard,
  onRotateRequest
}: ProjectCardProps) {
  const displayKey = revealedKey || 'ntc_live_••••••••••••••••••••••••••••••••••••••••••••••••';

  return (
    <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-6 relative overflow-hidden">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-white">{project.name}</h3>
          <p className="text-[10px] text-slate-500 font-mono">ID: {project.id}</p>
        </div>
        
        <button
          type="button"
          onClick={() => onRotateRequest(project.id, project.name)}
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
          <div className={`flex-1 font-mono text-xs select-all break-all pr-2 tracking-wide ${revealedKey ? 'text-violet-300' : 'text-slate-500'}`}>
            {displayKey}
          </div>
          
          <div className="flex items-center gap-1 shrink-0 border-l border-slate-900 pl-2">
            <button
              type="button"
              onClick={() => toggleKeyVisibility(project.id)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-colors"
              title={revealedKey ? "Hide Key" : "Reveal Key"}
            >
              {revealedKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard(project.id)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-colors"
              title="Copy to Clipboard"
            >
              {copiedKeyId === project.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Embed Integration Guides */}
      <IntegrationGuide apiKey={revealedKey || 'ntc_live_••••••••••••••••••••••••'} />
    </div>
  );
}
