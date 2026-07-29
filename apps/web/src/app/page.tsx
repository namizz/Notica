import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BellRing,
  Braces,
  CheckCircle2,
  Clock3,
  Code2,
  Gauge,
  KeyRound,
  Layers3,
  Mail,
  Radio,
  ShieldCheck,
  Sparkles,
  Webhook,
  Zap,
} from 'lucide-react';
import { CodeBlock } from '@/components/public/CodeBlock';
import { NotificationDemo } from '@/components/public/NotificationDemo';
import { PublicFooter, PublicHeader } from '@/components/public/PublicShell';

export const metadata: Metadata = {
  title: 'Notica — Notification infrastructure for modern applications',
  description:
    'Send in-app, web push, and email notifications through one reliable developer API with queues, realtime delivery, and tracking built in.',
};

const sendExample = `curl -X POST $NOTICA_API_URL/notifications \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ntca_your_project_key" \\
  -d '{
    "recipientId": "user_842",
    "title": "Payment received",
    "body": "Your payment was processed.",
    "channel": "IN_APP"
  }'`;

const features = [
  {
    icon: Radio,
    title: 'Realtime by default',
    description: 'Deliver in-app events over authenticated, recipient-scoped WebSocket connections.',
  },
  {
    icon: Gauge,
    title: 'Queues and retries',
    description: 'Absorb traffic spikes and process every delivery asynchronously with Redis and BullMQ.',
  },
  {
    icon: Activity,
    title: 'Delivery visibility',
    description: 'Inspect queued, sent, delivered, skipped, simulated, and failed outcomes in one place.',
  },
  {
    icon: KeyRound,
    title: 'Project isolation',
    description: 'Keep tenants, projects, recipients, credentials, and realtime rooms strictly separated.',
  },
  {
    icon: Braces,
    title: 'Developer-first API',
    description: 'Start with a clear REST API, copyable examples, Swagger reference, and a browser SDK.',
  },
  {
    icon: ShieldCheck,
    title: 'Safer browser auth',
    description: 'Use short-lived recipient tokens in the browser without exposing project API keys.',
  },
];

const channels = [
  {
    icon: BellRing,
    title: 'In-app',
    tag: 'Realtime',
    description: 'Instant activity feeds, notification centers, badges, and toast alerts.',
    color: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
  },
  {
    icon: Webhook,
    title: 'Web push',
    tag: 'Background',
    description: 'Reach users through native browser notifications, even after they close your tab.',
    color: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  },
  {
    icon: Mail,
    title: 'Email',
    tag: 'Async',
    description: 'Deliver transactional messages using SMTP through an extensible provider layer.',
    color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  },
];

export default function HomePage() {
  return (
    <div className="public-site min-h-screen overflow-hidden bg-[#070b12] text-slate-100">
      <PublicHeader />

      <main>
        <section className="public-grid relative">
          <div className="absolute left-1/2 top-0 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[0.82fr_1.18fr] lg:py-28">
            <div>
              <div className="public-hero-badge mb-6 inline-flex items-center gap-2 rounded-full border border-violet-400/15 bg-violet-500/5 px-3 py-1.5 text-xs font-medium text-violet-200">
                <Sparkles className="h-3.5 w-3.5" />
                Notification service API for modern apps
              </div>
              <h1 className="max-w-3xl text-5xl font-semibold leading-[1.03] tracking-[-0.045em] text-white sm:text-6xl">
                Notification infrastructure
                <span className="public-gradient-text bg-gradient-to-r from-violet-300 via-indigo-300 to-sky-300 bg-clip-text text-transparent"> for every application.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-slate-400 sm:text-lg">
                Connect your ecommerce store, learning platform, communication product, or any other application to
                one service for in-app, web push, and email notifications.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="public-primary-cta inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-violet-600/20 transition-colors hover:bg-violet-500"
                >
                  Start building free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.06]"
                >
                  <Code2 className="h-4 w-4" />
                  Read the docs
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
                {['REST API', 'JavaScript SDK', 'Recipient-scoped auth'].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 rounded-full bg-violet-600/10 blur-3xl" />
              <div className="relative overflow-hidden rounded-3xl border border-violet-400/15 bg-[#050811] p-1.5 shadow-2xl shadow-violet-950/30">
                <Image
                  src="/images/notica-notification-flow.png"
                  alt="Ecommerce, language learning, and communication applications sending events through Notica to a user's phone, browser, and email"
                  width={1536}
                  height={1024}
                  priority
                  className="h-auto w-full rounded-[18px]"
                />
                <div className="absolute inset-x-5 bottom-5 flex flex-wrap items-center justify-center gap-2">
                  {['Application events', 'Notica delivery hub', 'User notifications'].map((label, index) => (
                    <span key={label} className="public-image-caption inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#080c14]/90 px-3 py-1.5 text-[10px] font-medium text-slate-300 backdrop-blur">
                      <span className={`h-1.5 w-1.5 rounded-full ${index === 0 ? 'bg-violet-400' : index === 1 ? 'bg-indigo-300' : 'bg-emerald-400'}`} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-white/5 bg-white/[0.015]">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.78fr_1.22fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Interactive delivery preview</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">See one notification move through Notica.</h2>
              <p className="mt-4 max-w-lg leading-7 text-slate-400">
                Your application sends one authenticated request. Notica receives it, queues the work, delivers through
                the selected channel, and records the result for your team.
              </p>
            </div>
            <NotificationDemo />
          </div>
        </section>

        <section id="product" className="border-y border-white/5 bg-white/[0.015]">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Delivery channels</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Meet users wherever they are.
              </h2>
              <p className="mt-4 leading-7 text-slate-400">
                Use one recipient model and a consistent API while Notica handles the delivery details for each channel.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {channels.map((channel) => {
                const Icon = channel.icon;
                return (
                  <article key={channel.title} className="rounded-2xl border border-white/7 bg-slate-950/50 p-6 transition-transform hover:-translate-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${channel.color}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="rounded-full border border-white/7 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {channel.tag}
                      </span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-white">{channel.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{channel.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">A shorter path to production</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              One request enters. A reliable delivery comes out.
            </h2>
            <p className="mt-4 max-w-xl leading-7 text-slate-400">
              Identify a recipient, send a notification, and let Notica coordinate persistence, queues, channel delivery,
              realtime events, and status tracking.
            </p>
            <div className="mt-8 space-y-5">
              {[
                ['01', 'Create a project', 'Get an API key for your application or environment.'],
                ['02', 'Identify recipients', 'Sync each user to a project-scoped recipient profile.'],
                ['03', 'Send and observe', 'Dispatch through the API and inspect outcomes in your dashboard.'],
              ].map(([number, title, description]) => (
                <div key={number} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/5 font-mono text-xs text-violet-300">
                    {number}
                  </span>
                  <div>
                    <h3 className="font-semibold text-white">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <CodeBlock code={sendExample} label="Send your first notification" />
        </section>

        <section className="border-y border-white/5 bg-white/[0.015]">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Infrastructure included</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                The difficult parts are already connected.
              </h2>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/7 bg-white/7 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className="bg-[#090d16] p-6">
                    <Icon className="h-5 w-5 text-violet-300" />
                    <h3 className="mt-4 font-semibold text-white">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{feature.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="security" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="public-security-panel overflow-hidden rounded-3xl border border-violet-400/15 bg-gradient-to-br from-violet-500/10 via-slate-950 to-sky-500/5 p-7 sm:p-10">
            <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-200">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h2 className="mt-6 text-3xl font-semibold tracking-tight text-white">Credentials stay on the right side of your stack.</h2>
                <p className="mt-4 max-w-xl leading-7 text-slate-400">
                  Project API keys authenticate server-to-server requests. Browser clients receive short-lived,
                  recipient-scoped tokens, so master credentials never need to ship in frontend code.
                </p>
              </div>
              <div className="space-y-3">
                {[
                  [KeyRound, 'One-time API key reveal and secure rotation'],
                  [Layers3, 'Project and tenant scoped data access'],
                  [Clock3, 'Short-lived tokens for browser sessions'],
                  [Zap, 'Rate limiting and validated API payloads'],
                ].map(([Icon, text]) => {
                  const ItemIcon = Icon as typeof KeyRound;
                  return (
                    <div key={text as string} className="flex items-center gap-3 rounded-xl border border-white/7 bg-black/20 px-4 py-3 text-sm text-slate-300">
                      <ItemIcon className="h-4 w-4 text-violet-300" />
                      {text as string}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 pb-24 sm:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">Ship the feature, not the notification system.</h2>
            <p className="mx-auto mt-5 max-w-2xl leading-7 text-slate-400">
              Create your first project, keep the API key on your server, and deliver a real notification in minutes.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/register" className="public-white-cta inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-violet-100">
                Create an account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/docs#quickstart" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5">
                View quickstart
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
