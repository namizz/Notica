"use client";

import { useState } from 'react';
import { BellRing, Check, ChevronRight, Database, LoaderCircle, Send, UserRound, Smartphone, Mail } from 'lucide-react';

type DemoChannel = 'IN_APP' | 'SMS' | 'EMAIL';

const channelSteps: Record<DemoChannel, Array<{ label: string; icon: any }>> = {
  IN_APP: [
    { label: 'API received', icon: Send },
    { label: 'Queued (Redis)', icon: Database },
    { label: 'WebSocket Emitted', icon: BellRing },
    { label: 'In-App Rendered', icon: UserRound },
  ],
  SMS: [
    { label: 'API received', icon: Send },
    { label: 'Leased (Outbox)', icon: Database },
    { label: 'Gateway Phone', icon: Smartphone },
    { label: 'Carrier Delivery', icon: Check },
  ],
  EMAIL: [
    { label: 'API received', icon: Send },
    { label: 'Queued (BullMQ)', icon: Database },
    { label: 'Resend / SMTP', icon: Mail },
    { label: 'Inbox Delivered', icon: Check },
  ],
};

export function NotificationDemo() {
  const [selectedChannel, setSelectedChannel] = useState<DemoChannel>('SMS');
  const [activeStep, setActiveStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [delivered, setDelivered] = useState(false);

  const steps = channelSteps[selectedChannel];

  const runDemo = () => {
    if (running) return;
    setRunning(true);
    setDelivered(false);
    setActiveStep(0);

    [1, 2, 3].forEach((step) => {
      window.setTimeout(() => setActiveStep(step), step * 650);
    });

    window.setTimeout(() => {
      setDelivered(true);
      setRunning(false);
    }, 2600);
  };

  return (
    <div className="public-demo relative overflow-hidden rounded-3xl border border-white/8 bg-slate-950/70 p-5 shadow-2xl shadow-violet-950/20 sm:p-7">
      <div className="absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Live delivery pipeline</p>
          <p className="mt-1 text-xs text-slate-500">See what happens after one API request.</p>
        </div>

        {/* Channel selector buttons */}
        <div className="flex bg-slate-900 border border-slate-800 p-0.5 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setSelectedChannel('SMS'); setActiveStep(-1); setDelivered(false); }}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${selectedChannel === 'SMS' ? 'bg-emerald-600 text-white shadow shadow-emerald-600/30' : 'text-slate-400 hover:text-white'}`}
          >
            SMS
          </button>
          <button
            type="button"
            onClick={() => { setSelectedChannel('IN_APP'); setActiveStep(-1); setDelivered(false); }}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${selectedChannel === 'IN_APP' ? 'bg-violet-600 text-white shadow shadow-violet-600/30' : 'text-slate-400 hover:text-white'}`}
          >
            In-App
          </button>
          <button
            type="button"
            onClick={() => { setSelectedChannel('EMAIL'); setActiveStep(-1); setDelivered(false); }}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${selectedChannel === 'EMAIL' ? 'bg-amber-600 text-white shadow shadow-amber-600/30' : 'text-slate-400 hover:text-white'}`}
          >
            Email
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/6 bg-[#080c14] p-4">
        <div className="mb-4 flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
        </div>
        <pre className="overflow-x-auto text-[11px] leading-6 text-slate-400 sm:text-xs">
          <code>
            {selectedChannel === 'SMS' && (
              <>
                <span className="text-violet-300">await</span> notica.send({'{\n'}
                {'  '}recipientId: <span className="text-emerald-300">&quot;user_842&quot;</span>,{'\n'}
                {'  '}phone: <span className="text-emerald-300">&quot;+251911234567&quot;</span>,{'\n'}
                {'  '}title: <span className="text-emerald-300">&quot;Security OTP&quot;</span>,{'\n'}
                {'  '}body: <span className="text-emerald-300">&quot;Your verification code is 482913&quot;</span>,{'\n'}
                {'  '}channel: <span className="text-emerald-300">&quot;SMS&quot;</span>{'\n'}
                {'}'});
              </>
            )}
            {selectedChannel === 'IN_APP' && (
              <>
                <span className="text-violet-300">await</span> notica.send({'{\n'}
                {'  '}recipientId: <span className="text-emerald-300">&quot;user_842&quot;</span>,{'\n'}
                {'  '}title: <span className="text-emerald-300">&quot;Payment received&quot;</span>,{'\n'}
                {'  '}body: <span className="text-emerald-300">&quot;Order #1002 payment confirmed.&quot;</span>,{'\n'}
                {'  '}channel: <span className="text-emerald-300">&quot;IN_APP&quot;</span>{'\n'}
                {'}'});
              </>
            )}
            {selectedChannel === 'EMAIL' && (
              <>
                <span className="text-violet-300">await</span> notica.send({'{\n'}
                {'  '}recipientId: <span className="text-emerald-300">&quot;user_842&quot;</span>,{'\n'}
                {'  '}email: <span className="text-emerald-300">&quot;alex@example.com&quot;</span>,{'\n'}
                {'  '}title: <span className="text-emerald-300">&quot;Welcome to Notica&quot;</span>,{'\n'}
                {'  '}body: <span className="text-emerald-300">&quot;Your account is ready to use.&quot;</span>,{'\n'}
                {'  '}channel: <span className="text-emerald-300">&quot;EMAIL&quot;</span>{'\n'}
                {'}'});
              </>
            )}
          </code>
        </pre>
      </div>

      <div className="my-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isReached = activeStep >= index;
          return (
            <div key={step.label} className="relative">
              <div
                className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border px-2 text-center transition-all duration-500 ${
                  isReached
                    ? 'border-violet-400/30 bg-violet-500/10 text-violet-200'
                    : 'border-white/6 bg-white/[0.02] text-slate-600'
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${isReached ? 'bg-violet-500/15' : 'bg-white/[0.03]'}`}>
                  {isReached && activeStep === index && running ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : isReached ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </span>
                <span className="text-[11px] font-medium">{step.label}</span>
              </div>
              {index < steps.length - 1 && (
                <ChevronRight className="absolute -right-3 top-10 z-10 hidden h-4 w-4 text-slate-700 sm:block" />
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={runDemo}
        disabled={running}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/15 transition-all hover:bg-violet-500 disabled:cursor-wait disabled:opacity-70 cursor-pointer"
      >
        {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : delivered ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        {running ? 'Dispatching notification…' : delivered ? 'Delivered — run again' : 'Send a test notification'}
      </button>
    </div>
  );
}
