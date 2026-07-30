"use client";

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CodeBlock({
  code,
  label = 'bash',
  className = '',
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className={`public-code-block overflow-hidden rounded-2xl border border-white/8 bg-[#080c14] ${className}`}>
      <div className="flex items-center justify-between border-b border-white/6 px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-6 text-slate-300 sm:text-[13px]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

