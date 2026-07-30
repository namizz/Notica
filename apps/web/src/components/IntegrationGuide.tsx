import React, { useState } from 'react';
import { Code } from 'lucide-react';

interface IntegrationGuideProps {
  apiKey: string;
}

export function IntegrationGuide({ apiKey }: IntegrationGuideProps) {
  const [activeTab, setActiveTab] = useState('nodejs');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || apiUrl;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'nodejs':
        return (
          <>
            <span className="text-slate-500">{'// Install Notica backend package: npm install @notica/node'}</span>
            <br />
            <span className="text-violet-400">const</span> Notica = require(<span className="text-emerald-400">&apos;@notica/node&apos;</span>);
            <br />
            <span className="text-violet-400">const</span> notica = Notica.init(<span className="text-emerald-400">&apos;{apiKey}&apos;</span>);
            <br />
            <br />
            <span className="text-slate-500">{'// Dispatch a real-time event to a recipient user'}</span>
            <br />
            <span className="text-violet-400">await</span> notica.notify(<span className="text-emerald-400">&apos;user_123&apos;</span>, &#123;
            <br />
            &nbsp;&nbsp;title: <span className="text-emerald-400">&apos;Order Confirmed! 👟&apos;</span>,
            <br />
            &nbsp;&nbsp;body: <span className="text-emerald-400">&apos;Your sneakers are being prepared.&apos;</span>,
            <br />
            &nbsp;&nbsp;channel: <span className="text-emerald-400">&apos;IN_APP&apos;</span>
            <br />
            &#125;);
          </>
        );

      case 'nextjs':
        return (
          <>
            <span className="text-slate-500">{'// app/api/notify/route.ts (Next.js App Router API Route)'}</span>
            <br />
            <span className="text-violet-400">import</span> &#123; NextResponse &#125; <span className="text-violet-400 font-semibold">from</span> <span className="text-emerald-400">&apos;next/server&apos;</span>;
            <br />
            <br />
            <span className="text-violet-400">export async function</span> POST(req: Request) &#123;
            <br />
            &nbsp;&nbsp;<span className="text-violet-400">const</span> &#123; userId, message &#125; = <span className="text-violet-400">await</span> req.json();
            <br />
            <br />
            &nbsp;&nbsp;<span className="text-violet-400">const</span> res = <span className="text-violet-400">await</span> fetch(<span className="text-emerald-400">&apos;{apiUrl}/notifications&apos;</span>, &#123;
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;method: <span className="text-emerald-400">&apos;POST&apos;</span>,
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;headers: &#123;
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-emerald-400">&apos;x-api-key&apos;</span>: <span className="text-emerald-400">&apos;{apiKey}&apos;</span>,
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-emerald-400">&apos;Content-Type&apos;</span>: <span className="text-emerald-400">&apos;application/json&apos;</span>
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&#125;,
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;body: JSON.stringify(&#123;
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;recipientId: userId,
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;title: <span className="text-emerald-400">&apos;Notification Alert!&apos;</span>,
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;body: message,
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;channel: <span className="text-emerald-400">&apos;IN_APP&apos;</span>
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&#125;)
            <br />
            &nbsp;&nbsp;&#125;);
            <br />
            <br />
            &nbsp;&nbsp;<span className="text-violet-400">return</span> NextResponse.json(&#123; success: res.ok &#125;);
            <br />
            &#125;
          </>
        );

      case 'browser':
        return (
          <>
            <span className="text-slate-500">{'<!-- Load Client SDK inside website HTML -->'}</span>
            <br />
            <span className="text-slate-400">&lt;</span><span className="text-violet-400">script</span> <span className="text-amber-400">src</span>=<span className="text-emerald-400">&quot;https://cdn.socket.io/4.7.5/socket.io.min.js&quot;</span><span className="text-slate-400">&gt;&lt;/</span><span className="text-violet-400">script</span><span className="text-slate-400">&gt;</span>
            <br />
            <span className="text-slate-400">&lt;</span><span className="text-violet-400">script</span> <span className="text-amber-400">src</span>=<span className="text-emerald-400">&quot;{apiUrl}/sdk/notica.js&quot;</span><span className="text-slate-400">&gt;&lt;/</span><span className="text-violet-400">script</span><span className="text-slate-400">&gt;</span>
            <br />
            <br />
            <span className="text-slate-400">&lt;</span><span className="text-violet-400">script</span><span className="text-slate-400">&gt;</span>
            <br />
            &nbsp;&nbsp;<span className="text-slate-500">{'// Initialize client'}</span>
            <br />
            &nbsp;&nbsp;Notica.init(&#123;
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;clientToken: <span className="text-emerald-400">&apos;short-lived-token-from-your-backend&apos;</span>,
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;apiUrl: <span className="text-emerald-400">&apos;{apiUrl}&apos;</span>,
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;wsUrl: <span className="text-emerald-400">&apos;{wsUrl}&apos;</span>
            <br />
            &nbsp;&nbsp;&#125;);
            <br />
            <br />
            &nbsp;&nbsp;<span className="text-slate-500">{'// The token already identifies and scopes this recipient'}</span>
            <br />
            &nbsp;&nbsp;Notica.identify(<span className="text-emerald-400">&apos;customer_789&apos;</span>);
            <br />
            <br />
            &nbsp;&nbsp;<span className="text-slate-500">{'// Receive instant updates over WebSocket'}</span>
            <br />
            &nbsp;&nbsp;Notica.onNotification((data) =&gt; &#123;
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;alert(data.title + <span className="text-emerald-400">&quot;: &quot;</span> + data.body);
            <br />
            &nbsp;&nbsp;&#125;);
            <br />
            <span className="text-slate-400">&lt;/</span><span className="text-violet-400">script</span><span className="text-slate-400">&gt;</span>
          </>
        );

      case 'sw':
        return (
          <>
            <span className="text-slate-500">{'// public/sw.js (Service Worker for background Web Push)'}</span>
            <br />
            self.addEventListener(<span className="text-emerald-400">&apos;push&apos;</span>, (event) =&gt; &#123;
            <br />
            &nbsp;&nbsp;<span className="text-violet-400">const</span> data = event.data ? event.data.json() : &#123;&#125;;
            <br />
            &nbsp;&nbsp;event.waitUntil(
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;self.registration.showNotification(data.title || <span className="text-emerald-400">&apos;Alert&apos;</span>, &#123;
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;body: data.body || <span className="text-emerald-400">&apos;&apos;</span>,
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon: <span className="text-emerald-400">&apos;/logo.png&apos;</span>
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&#125;)
            <br />
            &nbsp;&nbsp;);
            <br />
            &#125;);
            <br />
            <br />
            <span className="text-slate-500">{'// Register service worker and enable Web Push from frontend'}</span>
            <br />
            <span className="text-violet-400">await</span> Notica.registerPush(<span className="text-emerald-400">&apos;/sw.js&apos;</span>);
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="mt-6 border-t border-slate-900 pt-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <Code className="h-4 w-4 text-violet-400" />
          <span>Quick Integration Guide</span>
        </div>
        
        {/* Tabs Selector */}
        <div className="flex bg-slate-950 border border-slate-900 p-0.5 rounded-lg text-[10px] font-semibold text-slate-400">
          <button
            type="button"
            onClick={() => setActiveTab('nodejs')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${activeTab === 'nodejs' ? 'bg-violet-600 text-white shadow shadow-violet-600/25' : 'hover:text-slate-200'}`}
          >
            Node.js (Backend)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('nextjs')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${activeTab === 'nextjs' ? 'bg-violet-600 text-white shadow shadow-violet-600/25' : 'hover:text-slate-200'}`}
          >
            Next.js (App Router)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('browser')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${activeTab === 'browser' ? 'bg-violet-600 text-white shadow shadow-violet-600/25' : 'hover:text-slate-200'}`}
          >
            Browser SDK
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sw')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${activeTab === 'sw' ? 'bg-violet-600 text-white shadow shadow-violet-600/25' : 'hover:text-slate-200'}`}
          >
            Service Worker
          </button>
        </div>
      </div>

      {/* Code Block Container */}
      <div className="relative bg-slate-950 rounded-xl p-4 border border-slate-900 font-mono text-[11px] text-slate-300 leading-relaxed overflow-x-auto max-h-[260px] overflow-y-auto">
        {renderTabContent()}
      </div>
    </div>
  );
}
