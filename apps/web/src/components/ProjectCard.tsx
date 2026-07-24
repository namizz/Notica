import React from 'react';
import { RotateCw } from 'lucide-react';
import { IntegrationGuide } from './IntegrationGuide';

interface Project {
  id: string;
  name: string;
  apiKeyPrefix: string;
  createdAt: string;
}

interface ProjectCardProps {
  project: Project;
  onRotateRequest: (id: string, name: string) => void;
}

export function ProjectCard({ project, onRotateRequest }: ProjectCardProps) {
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

      <div className="mt-6 space-y-2">
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          API Key Identifier
        </label>
        <div className="max-w-2xl bg-slate-950 border border-slate-900 rounded-xl px-4 py-3">
          <div className="font-mono text-xs text-slate-400 tracking-wide">
            {project.apiKeyPrefix}••••••••••••••••••••••••
          </div>
        </div>
        <p className="text-[10px] text-slate-500">
          For security, the complete key is shown only once when it is created or rotated.
        </p>
      </div>

      <IntegrationGuide apiKey="ntc_live_your_key_here" />
    </div>
  );
}
