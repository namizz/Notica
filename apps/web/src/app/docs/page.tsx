import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BellRing,
  BookOpen,
  Braces,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Cpu,
  KeyRound,
  Layers3,
  LockKeyhole,
  Radio,
  Server,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { CodeBlock } from '@/components/public/CodeBlock';
import { PublicFooter, PublicHeader } from '@/components/public/PublicShell';

export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Integrate Notica in-app, web push, and email notifications with the REST API and JavaScript SDK.',
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const navGroups = [
  {
    title: 'Get started',
    links: [
      { href: '#overview', label: 'Overview' },
      { href: '#quickstart', label: 'Quickstart' },
      { href: '#concepts', label: 'Core concepts' },
    ],
  },
  {
    title: 'Build',
    links: [
      { href: '#api-reference', label: 'API reference' },
      { href: '#client-sdk', label: 'JavaScript SDK' },
      { href: '#web-push', label: 'Web Push' },
    ],
  },
  {
    title: 'Operate',
    links: [
      { href: '#security', label: 'Security' },
      { href: '#errors', label: 'Errors and statuses' },
    ],
  },
];

function Endpoint({
  method,
  path,
  description,
}: {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  description: string;
}) {
  const methodColor =
    method === 'GET'
      ? 'border-sky-500/20 bg-sky-500/10 text-sky-300'
      : method === 'PATCH'
        ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
        : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';

  return (
    <div className="rounded-xl border border-white/7 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-md border px-2 py-1 font-mono text-[10px] font-bold ${methodColor}`}>{method}</span>
        <code className="text-xs text-slate-200 sm:text-sm">{path}</code>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">{description}</p>
    </div>
  );
}

export default function DocumentationPage() {
  const identifyCode = `curl -X POST ${apiUrl}/recipients/identify \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ntca_your_project_key" \\
  -d '{
    "externalUserId": "user_842",
    "name": "Jane Doe",
    "email": "jane@example.com"
  }'`;

  const sendCode = `curl -X POST ${apiUrl}/notifications \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ntca_your_project_key" \\
  -d '{
    "recipientId": "user_842",
    "title": "Order shipped",
    "body": "Order #4895 is on its way.",
    "channel": "IN_APP"
  }'`;

  const tokenCode = `curl -X POST ${apiUrl}/client-tokens \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ntca_your_project_key" \\
  -d '{ "recipientId": "user_842" }'`;

  const sdkCode = `const { clientToken } = await fetch("/api/notica/client-token", {
  method: "POST"
}).then((response) => response.json());

Notica.init({
  clientToken,
  apiUrl: "${apiUrl}",
  wsUrl: "${process.env.NEXT_PUBLIC_WS_URL || apiUrl}"
});

Notica.onNotification((notification) => {
  showToast(notification.title, notification.body);
});`;

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      <PublicHeader />

      <div className="border-b border-white/5 bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link href="/" className="hover:text-white">Notica</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-slate-300">Documentation</span>
          </div>
          <div className="mt-6 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/15 bg-violet-500/5 px-3 py-1.5 text-xs text-violet-200">
                <BookOpen className="h-3.5 w-3.5" />
                Notica Docs · API v1
              </div>
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Build your first notification flow.</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
                Everything you need to identify recipients, dispatch messages, connect browser clients, and operate
                Notica safely.
              </p>
            </div>
            <Link
              href="/register"
              className="inline-flex w-fit items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Create a project
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      <nav
        className="sticky top-16 z-40 flex gap-2 overflow-x-auto border-b border-white/5 bg-[#070b12]/95 px-5 py-3 backdrop-blur lg:hidden"
        aria-label="Documentation sections"
      >
        {navGroups.flatMap((group) => group.links).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="shrink-0 rounded-full border border-white/7 bg-white/[0.025] px-3 py-1.5 text-xs text-slate-400 hover:text-white"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-14">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-7" aria-label="Documentation sections">
            {navGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">{group.title}</p>
                <div className="space-y-0.5">
                  {group.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-white/[0.03] hover:text-white"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          <section id="overview" className="scroll-mt-24 border-b border-white/7 pb-14">
            <SectionHeading
              eyebrow="Overview"
              title="Notification infrastructure through one API"
              description="Notica centralizes notification persistence, asynchronous processing, realtime delivery, browser push, email delivery, and status tracking for multiple projects and tenants."
            />
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                [Server, 'Backend integration', 'Use the project API key only from a trusted server.'],
                [Radio, 'Browser integration', 'Issue a short-lived token scoped to one recipient.'],
                [ActivityIcon, 'Operational visibility', 'Inspect delivery states through logs and the realtime console.'],
              ].map(([Icon, title, description]) => {
                const ItemIcon = Icon as typeof Server;
                return (
                  <article key={title as string} className="rounded-2xl border border-white/7 bg-white/[0.02] p-5">
                    <ItemIcon className="h-5 w-5 text-violet-300" />
                    <h3 className="mt-4 text-sm font-semibold text-white">{title as string}</h3>
                    <p className="mt-2 text-xs leading-6 text-slate-500">{description as string}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section id="quickstart" className="scroll-mt-24 border-b border-white/7 py-14">
            <SectionHeading
              eyebrow="Quickstart"
              title="Send a notification in three steps"
              description="Create a project in the dashboard and save the API key when it is displayed. Complete the remaining calls from your application backend."
            />

            <div className="space-y-9">
              <div>
                <h3 className="flex items-center gap-3 font-semibold text-white">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 font-mono text-xs text-violet-300">1</span>
                  Identify your recipient
                </h3>
                <p className="mb-4 ml-10 mt-2 text-sm leading-6 text-slate-500">
                  Create or update a project-scoped profile using the ID your own application already uses.
                </p>
                <CodeBlock code={identifyCode} label="bash" />
              </div>

              <div>
                <h3 className="flex items-center gap-3 font-semibold text-white">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 font-mono text-xs text-violet-300">2</span>
                  Dispatch the message
                </h3>
                <p className="mb-4 ml-10 mt-2 text-sm leading-6 text-slate-500">
                  Choose <code>IN_APP</code>, <code>WEB_PUSH</code>, or <code>EMAIL</code> as the channel.
                </p>
                <CodeBlock code={sendCode} label="bash" />
              </div>

              <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-5">
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-200">What happens next</h3>
                    <p className="mt-1 text-sm leading-6 text-emerald-100/60">
                      Notica persists the request, queues channel processing, records the outcome, and emits recipient-scoped
                      realtime events when appropriate.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="concepts" className="scroll-mt-24 border-b border-white/7 py-14">
            <SectionHeading
              eyebrow="Core concepts"
              title="The objects in a Notica integration"
              description="Understanding these boundaries keeps your integration secure and makes notification data easier to reason about."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [Layers3, 'Project', 'An application or environment with isolated recipients, notifications, and credentials.'],
                [KeyRound, 'API key', 'A server-side credential used to authenticate requests for exactly one project.'],
                [BellRing, 'Recipient', 'Your end user, identified by a stable external ID from your own system.'],
                [LockKeyhole, 'Client token', 'A short-lived credential allowing one browser to act as one recipient.'],
              ].map(([Icon, title, description]) => {
                const ItemIcon = Icon as typeof Layers3;
                return (
                  <div key={title as string} className="flex gap-4 rounded-xl border border-white/7 bg-white/[0.02] p-4">
                    <ItemIcon className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
                    <div>
                      <h3 className="text-sm font-semibold text-white">{title as string}</h3>
                      <p className="mt-1 text-xs leading-6 text-slate-500">{description as string}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section id="api-reference" className="scroll-mt-24 border-b border-white/7 py-14">
            <SectionHeading
              eyebrow="REST API"
              title="API reference"
              description={`The local API base URL is ${apiUrl}. Authenticated project endpoints require the x-api-key header; dashboard endpoints use a bearer access token.`}
            />
            <div className="space-y-3">
              <Endpoint method="POST" path="/recipients/identify" description="Create or update a recipient profile for the authenticated project." />
              <Endpoint method="GET" path="/recipients" description="List the recipients belonging to the authenticated project." />
              <Endpoint method="POST" path="/notifications" description="Persist and queue an in-app, Web Push, or email notification." />
              <Endpoint method="GET" path="/notifications/recipient/:externalUserId" description="Retrieve notification history for one project-scoped recipient." />
              <Endpoint method="PATCH" path="/notifications/:id/read" description="Mark one notification as read." />
              <Endpoint method="POST" path="/client-tokens" description="Issue a short-lived browser credential for an authenticated application user." />
              <Endpoint method="POST" path="/device-tokens/register" description="Register a browser push subscription using a client token." />
              <Endpoint method="GET" path="/device-tokens/vapid-key" description="Retrieve the public VAPID key used to create browser push subscriptions." />
            </div>
            <p className="mt-5 text-sm text-slate-500">
              Need schema-level exploration? The generated Swagger interface is available at{' '}
              <a href={`${apiUrl}/api-docs`} className="text-violet-300 hover:text-violet-200" target="_blank" rel="noreferrer">
                {apiUrl}/api-docs
              </a>.
            </p>
          </section>

          <section id="client-sdk" className="scroll-mt-24 border-b border-white/7 py-14">
            <SectionHeading
              eyebrow="JavaScript SDK"
              title="Connect a recipient browser"
              description="Your backend authenticates its user and requests a recipient-scoped client token. The browser uses that token for realtime connections and push registration."
            />
            <div className="mb-5 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-5">
              <div className="flex gap-3">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                <p className="text-sm leading-6 text-amber-100/70">
                  Never return the project API key to the browser. Only your trusted backend should call the client-token endpoint.
                </p>
              </div>
            </div>
            <CodeBlock code={tokenCode} label="Server: issue client token" />
            <CodeBlock code={sdkCode} label="Browser: initialize SDK" className="mt-4" />
          </section>

          <section id="web-push" className="scroll-mt-24 border-b border-white/7 py-14">
            <SectionHeading
              eyebrow="Web Push"
              title="Enable background browser delivery"
              description="After initializing the SDK with a client token, register a service worker and ask the active recipient for notification permission."
            />
            <CodeBlock
              label="javascript"
              code={`const registered = await Notica.registerPush("/sw.js");

if (!registered) {
  console.warn("Push permission or registration failed.");
}`}
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                [Cpu, 'HTTPS required', 'Production service workers and Push APIs require a secure origin.'],
                [ShieldCheck, 'Ask with context', 'Prompt after explaining why notifications benefit the user.'],
                [Terminal, 'Handle clicks', 'Your service worker should focus or open the relevant application route.'],
              ].map(([Icon, title, description]) => {
                const ItemIcon = Icon as typeof Cpu;
                return (
                  <div key={title as string} className="rounded-xl border border-white/7 p-4">
                    <ItemIcon className="h-4 w-4 text-sky-300" />
                    <h3 className="mt-3 text-xs font-semibold text-white">{title as string}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{description as string}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section id="security" className="scroll-mt-24 border-b border-white/7 py-14">
            <SectionHeading
              eyebrow="Security"
              title="Credential rules"
              description="Treat API keys as infrastructure secrets and client tokens as short-lived user credentials."
            />
            <div className="overflow-hidden rounded-2xl border border-white/7">
              {[
                ['Project API key', 'Server environment or secret manager', 'Never frontend code, repositories, logs, or support messages'],
                ['Client token', 'The authenticated recipient browser', 'Other recipients or long-term storage'],
                ['VAPID public key', 'Browser code', 'The VAPID private key must remain server-side'],
              ].map(([credential, allowed, prohibited], index) => (
                <div key={credential} className={`grid gap-2 p-4 text-sm sm:grid-cols-3 ${index > 0 ? 'border-t border-white/7' : ''}`}>
                  <strong className="text-white">{credential}</strong>
                  <span className="text-emerald-300/80">{allowed}</span>
                  <span className="text-rose-300/70">{prohibited}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="errors" className="scroll-mt-24 pt-14">
            <SectionHeading
              eyebrow="Operations"
              title="Errors and delivery states"
              description="An accepted API request and a successful channel delivery are separate events. Use delivery logs to understand the final result."
            />
            <div className="flex flex-wrap gap-2">
              {[
                ['QUEUED', 'text-sky-300 border-sky-500/20 bg-sky-500/5'],
                ['SENT', 'text-violet-300 border-violet-500/20 bg-violet-500/5'],
                ['DELIVERED', 'text-emerald-300 border-emerald-500/20 bg-emerald-500/5'],
                ['SKIPPED', 'text-amber-300 border-amber-500/20 bg-amber-500/5'],
                ['SIMULATED', 'text-indigo-300 border-indigo-500/20 bg-indigo-500/5'],
                ['FAILED', 'text-rose-300 border-rose-500/20 bg-rose-500/5'],
              ].map(([status, style]) => (
                <span key={status} className={`rounded-lg border px-3 py-2 font-mono text-xs ${style}`}>{status}</span>
              ))}
            </div>
            <div className="mt-8 flex flex-col justify-between gap-5 rounded-2xl border border-violet-400/15 bg-violet-500/5 p-6 sm:flex-row sm:items-center">
              <div>
                <h3 className="font-semibold text-white">Ready to use a real project?</h3>
                <p className="mt-1 text-sm text-slate-500">Create an account, save your one-time API key, and follow the quickstart.</p>
              </div>
              <Link href="/register" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-violet-300 hover:text-violet-200">
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        </main>
      </div>

      <PublicFooter />
    </div>
  );
}

function ActivityIcon(props: React.ComponentProps<typeof Radio>) {
  return <Braces {...props} />;
}
