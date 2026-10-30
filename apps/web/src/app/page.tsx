import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BellRing,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  KeyRound,
  Layers3,
  LockKeyhole,
  Mail,
  Radio,
  Terminal,
  Webhook,
} from 'lucide-react';
import { CodeBlock } from '@/components/public/CodeBlock';
import { GetApiKeyCta } from '@/components/public/GetApiKeyCta';
import { GuideNav } from '@/components/public/GuideNav';
import { NotificationDemo } from '@/components/public/NotificationDemo';
import { PublicFooter, PublicHeader } from '@/components/public/PublicShell';

export const metadata: Metadata = {
  title: 'Notica — Notification API integration guide',
  description:
    'Send in-app, web push, and email notifications from your application with one authenticated request. Get an API key and integrate in three steps.',
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const wsUrl = process.env.NEXT_PUBLIC_WS_URL || apiUrl;

const sections = [
  { id: 'start', label: 'What you can send' },
  { id: 'api-key', label: '1 · Get your key' },
  { id: 'send', label: '2 · Send one' },
  { id: 'receive', label: '3 · Show in your app' },
  { id: 'push', label: 'Web push' },
  { id: 'email', label: 'Email' },
  { id: 'api', label: 'API reference' },
  { id: 'errors', label: 'Errors' },
  { id: 'dashboard', label: 'Your dashboard' },
] as const;

const sectionIds = sections.map((section) => section.id);

const sendCode = `curl -X POST ${apiUrl}/notifications \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ntc_live_your_project_key" \\
  -d '{
    "recipientId": "user_842",
    "title": "Order shipped",
    "body": "Order #4895 is on its way.",
    "channel": "IN_APP"
  }'`;

const sendNodeCode = `await fetch("${apiUrl}/notifications", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.NOTICA_API_KEY,
  },
  body: JSON.stringify({
    recipientId: user.id,      // your own user ID
    title: "Order shipped",
    body: \`Order #\${order.number} is on its way.\`,
    channel: "IN_APP",
  }),
});`;

const tokenCode = `// Your server — the API key never leaves it.
app.post("/api/notica/token", async (req, res) => {
  const response = await fetch("${apiUrl}/client-tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.NOTICA_API_KEY,
    },
    body: JSON.stringify({ recipientId: req.user.id }),
  });

  res.json(await response.json());
});`;

const sdkCode = `<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script src="${apiUrl}/sdk/notica.js"></script>

<script>
  // Ask your own server for a token — never ship the API key here.
  const { clientToken } = await fetch("/api/notica/token", {
    method: "POST",
  }).then((response) => response.json());

  Notica.init({
    clientToken,
    apiUrl: "${apiUrl}",
    wsUrl: "${wsUrl}",
  });

  Notica.identify("user_842");

  Notica.onNotification((notification) => {
    showToast(notification.title, notification.body);
  });
</script>`;

const pushCode = `// Needs a service worker at /sw.js in your site root.
const enabled = await Notica.registerPush();

if (enabled) {
  console.log("This browser will now receive notifications in the background.");
}`;

const identifyCode = `curl -X POST ${apiUrl}/recipients/identify \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ntc_live_your_project_key" \\
  -d '{
    "externalUserId": "user_842",
    "name": "Jane Doe",
    "email": "jane@example.com"
  }'`;

const channels = [
  {
    icon: BellRing,
    name: 'IN_APP',
    title: 'In-app',
    description: 'Appears instantly inside your app. Needs the browser SDK from step 3.',
    color: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
  },
  {
    icon: Webhook,
    name: 'WEB_PUSH',
    title: 'Web push',
    description: 'A browser notification that arrives even when your tab is closed.',
    color: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  },
  {
    icon: Mail,
    name: 'EMAIL',
    title: 'Email',
    description: 'A transactional email. Needs an email address on the recipient.',
    color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  },
];

const endpoints = [
  ['POST', '/notifications', 'API key', 'Send a notification.'],
  ['GET', '/notifications', 'API key', 'List sent notifications, paginated and filterable.'],
  ['GET', '/notifications/recipient/:id', 'API key', 'One recipient’s notification history.'],
  ['PATCH', '/notifications/:id/read', 'API key', 'Mark a notification as read.'],
  ['POST', '/recipients/identify', 'API key', 'Attach a name and email to a recipient.'],
  ['POST', '/client-tokens', 'API key', 'Issue a short-lived browser token for one recipient.'],
  ['POST', '/device-tokens/register', 'Client token', 'Register a browser for web push.'],
  ['GET', '/device-tokens/vapid-key', 'Client token', 'Public key used to create a push subscription.'],
] as const;

const fields = [
  ['recipientId', 'string', 'Required', 'Your own user ID. Up to 191 characters.'],
  ['title', 'string', 'Required', 'Up to 160 characters.'],
  ['body', 'string', 'Required', 'Up to 5000 characters.'],
  ['channel', 'enum', 'Required', 'IN_APP, WEB_PUSH, or EMAIL.'],
] as const;

const errors = [
  ['201', 'Accepted. The notification is stored and queued for delivery.'],
  ['400', 'A field is missing or too long. The response names the field.'],
  ['401', 'The API key is missing, malformed, or revoked.'],
  ['429', 'Too many requests. Back off and retry.'],
] as const;

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
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">{description}</p>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="flex items-center gap-3 font-semibold text-white">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 font-mono text-xs text-violet-300">
          {number}
        </span>
        {title}
      </h3>
      <div className="ml-10 mt-2 space-y-4">{children}</div>
    </div>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: 'warn' | 'good';
  title: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === 'warn'
      ? 'border-amber-500/20 bg-amber-500/5'
      : 'border-emerald-500/15 bg-emerald-500/5';
  const Icon = tone === 'warn' ? CircleAlert : CheckCircle2;
  const iconColor = tone === 'warn' ? 'text-amber-400' : 'text-emerald-400';
  const titleColor = tone === 'warn' ? 'text-amber-200' : 'text-emerald-200';

  return (
    <div className={`rounded-2xl border p-5 ${styles}`}>
      <div className="flex gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
        <div>
          <h4 className={`text-sm font-semibold ${titleColor}`}>{title}</h4>
          <div className="mt-1 text-sm leading-6 text-slate-400">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function IntegrationGuidePage() {
  return (
    <div className="public-site min-h-screen bg-[#070b12] text-slate-100">
      <GuideNav sectionIds={sectionIds} />
      <PublicHeader />

      <header className="border-b border-white/5 bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-500/15 bg-violet-500/5 px-3 py-1.5 text-xs text-violet-200">
            <BookOpen className="h-3.5 w-3.5" />
            Integration guide · API v1
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl">
            Send notifications from your app in three steps.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">
            Notica delivers in-app, web push, and email notifications for your application. You send one
            authenticated request. Notica stores it, delivers it, retries if it fails, and records what
            happened.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <GetApiKeyCta />
            <a
              href="#send"
              data-doc-section-link="send"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.06]"
            >
              <Terminal className="h-4 w-4" />
              Skip to the request
            </a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
            {['One request to send', '3 delivery channels', 'REST API and browser SDK'].map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </header>

      <nav
        className="public-docs-mobile-nav sticky top-16 z-40 flex gap-2 overflow-x-auto border-b border-white/5 bg-[#070b12]/95 px-5 py-3 backdrop-blur lg:hidden"
        aria-label="Guide sections"
      >
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            data-doc-section-link={section.id}
            className="public-docs-nav-link shrink-0 rounded-full border border-white/7 bg-white/[0.025] px-3 py-1.5 text-xs text-slate-400 hover:text-white"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-14">
        <aside className="hidden lg:block">
          <nav className="sticky top-24" aria-label="Guide sections">
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
              On this page
            </p>
            <div className="space-y-0.5">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  data-doc-section-link={section.id}
                  className="public-docs-nav-link block rounded-lg border border-transparent px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-white/[0.03] hover:text-white"
                >
                  {section.label}
                </a>
              ))}
            </div>
          </nav>
        </aside>

        <main className="min-w-0">
          <section id="start" className="scroll-mt-28 border-b border-white/7 pb-14">
            <SectionHeading
              eyebrow="What you can send"
              title="Three channels, one request shape"
              description="Pick a channel per notification with the channel field. Everything else about the request stays the same."
            />
            <div className="grid gap-4 sm:grid-cols-3">
              {channels.map((channel) => {
                const Icon = channel.icon;
                return (
                  <article key={channel.name} className="rounded-2xl border border-white/7 bg-white/[0.02] p-5">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${channel.color}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-sm font-semibold text-white">{channel.title}</h3>
                    <code className="mt-1 block font-mono text-[11px] text-violet-300">{channel.name}</code>
                    <p className="mt-2 text-xs leading-6 text-slate-500">{channel.description}</p>
                  </article>
                );
              })}
            </div>

            <h3 className="mt-10 text-sm font-semibold text-white">What happens after you send</h3>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                'Notica stores the notification and answers right away, so your request is never waiting on delivery.',
                'Delivery runs in the background on the channel you chose.',
                'If it fails, Notica retries automatically — up to three attempts.',
                'Every attempt is recorded, and you can read the outcome in your dashboard.',
              ].map((text, index) => (
                <li key={text} className="flex gap-3 rounded-xl border border-white/7 bg-white/[0.02] p-4">
                  <span className="font-mono text-xs text-violet-300">{index + 1}</span>
                  <span className="text-sm leading-6 text-slate-400">{text}</span>
                </li>
              ))}
            </ol>

            <div className="mt-8">
              <NotificationDemo />
            </div>
          </section>

          <section id="api-key" className="scroll-mt-28 border-b border-white/7 py-14">
            <SectionHeading
              eyebrow="Step 1"
              title="Get your API key"
              description="Your key identifies one project. Create a separate project for each application or environment you send from."
            />
            <div className="space-y-8">
              <Step number="1" title="Create a free account">
                <p className="text-sm leading-6 text-slate-500">
                  Sign up with email, Google, or GitHub.
                </p>
                <GetApiKeyCta />
              </Step>

              <Step number="2" title="Create a project">
                <p className="text-sm leading-6 text-slate-500">
                  Name it after the app or environment it belongs to, such as{' '}
                  <code className="text-slate-300">storefront-production</code>.
                </p>
              </Step>

              <Step number="3" title="Copy the key">
                <p className="text-sm leading-6 text-slate-500">
                  Keys look like this. Store it as an environment variable on your server.
                </p>
                <CodeBlock code="NOTICA_API_KEY=ntc_live_4f8c21ab93e0d7..." label="env" />
              </Step>
            </div>

            <div className="mt-8">
              <Callout tone="warn" title="The key is shown once">
                Notica stores only a fingerprint of your key, so it cannot be shown again or recovered — if
                you lose it, rotate it in the dashboard and update your server. Keep it on your backend and
                never put it in frontend code; browsers use a short-lived client token instead, which is{' '}
                <a href="#receive" data-doc-section-link="receive" className="text-violet-300 hover:text-violet-200">
                  step 3
                </a>
                .
              </Callout>
            </div>
          </section>

          <section id="send" className="scroll-mt-28 border-b border-white/7 py-14">
            <SectionHeading
              eyebrow="Step 2"
              title="Send a notification"
              description="One request from your backend. Use the ID your application already has for the user — Notica creates the recipient the first time it sees it, so there is nothing to register up front."
            />
            <div className="space-y-6">
              <CodeBlock code={sendCode} label="curl" />
              <CodeBlock code={sendNodeCode} label="node" />
            </div>

            <div className="mt-8">
              <Callout tone="good" title="That is a working integration">
                You can stop here if you only need email or web push. The notification is stored, delivered,
                and visible in your dashboard. Continue to step 3 to show notifications inside your app.
              </Callout>
            </div>
          </section>

          <section id="receive" className="scroll-mt-28 border-b border-white/7 py-14">
            <SectionHeading
              eyebrow="Step 3"
              title="Show notifications in your app"
              description="For the IN_APP channel, the browser SDK opens a connection and hands you each notification as it arrives."
            />
            <div className="space-y-8">
              <Step number="1" title="Issue a token from your server">
                <p className="text-sm leading-6 text-slate-500">
                  A client token is tied to one user and expires on its own, so it is safe to send to the
                  browser. Your API key stays on the server.
                </p>
                <CodeBlock code={tokenCode} label="node" />
              </Step>

              <Step number="2" title="Connect in the browser">
                <p className="text-sm leading-6 text-slate-500">
                  Load the SDK, initialise it with the token, and handle incoming notifications however your
                  UI needs — a toast, a badge, a notification centre.
                </p>
                <CodeBlock code={sdkCode} label="html" />
              </Step>
            </div>
          </section>

          <section id="push" className="scroll-mt-28 border-b border-white/7 py-14">
            <SectionHeading
              eyebrow="Optional"
              title="Add web push"
              description="Web push reaches a user after they close your tab. One SDK call asks permission, registers the browser, and stores the subscription."
            />
            <CodeBlock code={pushCode} label="javascript" />
            <p className="mt-5 text-sm leading-7 text-slate-400">
              After that, send with <code className="text-slate-300">&quot;channel&quot;: &quot;WEB_PUSH&quot;</code>. A recipient who
              never granted permission has nothing to deliver to, and the attempt is reported as not
              delivered rather than failed. Expired browser subscriptions are cleaned up for you.
            </p>
          </section>

          <section id="email" className="scroll-mt-28 border-b border-white/7 py-14">
            <SectionHeading
              eyebrow="Optional"
              title="Add email"
              description="Email is the one channel that needs something extra: an address. Attach it to the recipient once, then send as usual."
            />
            <CodeBlock code={identifyCode} label="curl" />
            <p className="mt-5 text-sm leading-7 text-slate-400">
              Call this whenever a user signs up or changes their details. Then send with{' '}
              <code className="text-slate-300">&quot;channel&quot;: &quot;EMAIL&quot;</code>. Sending to a recipient with no address on
              file is reported as not delivered, with the reason recorded.
            </p>
          </section>

          <section id="api" className="scroll-mt-28 border-b border-white/7 py-14">
            <SectionHeading
              eyebrow="Reference"
              title="API reference"
              description="Every endpoint takes JSON and returns JSON. Authenticate server requests with your project key in the x-api-key header."
            />

            <CodeBlock code={`x-api-key: ntc_live_your_project_key`} label="header" />

            <h3 className="mt-10 text-sm font-semibold text-white">Endpoints</h3>
            <div className="mt-4 space-y-2">
              {endpoints.map(([method, path, auth, description]) => (
                <div key={`${method} ${path}`} className="rounded-xl border border-white/7 bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-md border px-2 py-1 font-mono text-[10px] font-bold ${
                        method === 'GET'
                          ? 'border-sky-500/20 bg-sky-500/10 text-sky-300'
                          : method === 'PATCH'
                            ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                            : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                      }`}
                    >
                      {method}
                    </span>
                    <code className="text-xs text-slate-200 sm:text-sm">{path}</code>
                    <span className="rounded-full border border-white/7 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                      {auth}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
                </div>
              ))}
            </div>

            <h3 className="mt-10 text-sm font-semibold text-white">Request body for POST /notifications</h3>
            <div className="mt-4 overflow-x-auto rounded-xl border border-white/7">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/7 bg-white/[0.02]">
                    {['Field', 'Type', '', 'Notes'].map((heading, index) => (
                      <th
                        key={heading || index}
                        className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fields.map(([name, type, required, notes]) => (
                    <tr key={name} className="border-b border-white/7 last:border-0">
                      <td className="px-4 py-3">
                        <code className="text-xs text-violet-300">{name}</code>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{type}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{required}</td>
                      <td className="px-4 py-3 text-sm leading-6 text-slate-400">{notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-6 text-sm leading-7 text-slate-400">
              A full schema with request and response examples you can try is at{' '}
              <a
                href={`${apiUrl}/api-docs`}
                target="_blank"
                rel="noreferrer"
                className="text-violet-300 hover:text-violet-200"
              >
                {apiUrl}/api-docs
              </a>
              .
            </p>
          </section>

          <section id="errors" className="scroll-mt-28 border-b border-white/7 py-14">
            <SectionHeading
              eyebrow="Errors"
              title="When something goes wrong"
              description="Request errors come back immediately with a status code. Delivery outcomes are recorded afterwards, because delivery happens in the background."
            />
            <div className="space-y-2">
              {errors.map(([code, description]) => (
                <div
                  key={code}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl border border-white/7 bg-white/[0.02] p-4"
                >
                  <code className="font-mono text-sm font-bold text-slate-200">{code}</code>
                  <span className="text-sm leading-6 text-slate-400">{description}</span>
                </div>
              ))}
            </div>

            <h3 className="mt-10 text-sm font-semibold text-white">Delivery outcomes</h3>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
              Each notification ends in one of three states, visible per attempt in your delivery logs.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ['Delivered', 'The channel confirmed it reached the recipient.', 'text-emerald-300'],
                ['Sent', 'Notica handed it off successfully and is awaiting confirmation.', 'text-sky-300'],
                ['Not delivered', 'Nothing to deliver to, or the channel rejected it. The reason is recorded.', 'text-amber-300'],
              ].map(([title, description, color]) => (
                <article key={title} className="rounded-xl border border-white/7 bg-white/[0.02] p-4">
                  <h4 className={`text-sm font-semibold ${color}`}>{title}</h4>
                  <p className="mt-2 text-xs leading-6 text-slate-500">{description}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="dashboard" className="scroll-mt-28 pt-14">
            <SectionHeading
              eyebrow="Your dashboard"
              title="Manage keys and watch deliveries"
              description="Everything you need after the integration is live, in one place."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [Layers3, 'Projects and keys', 'Create projects, rotate a key, and see which prefix is live.'],
                [Terminal, 'Delivery logs', 'Every notification and every attempt, filterable by channel and status.'],
                [Activity, 'Live console', 'Watch deliveries stream in while you test your integration.'],
                [Radio, 'Recipients', 'See who you have sent to and what they received.'],
                [LockKeyhole, 'Account security', 'Two-factor authentication and active session management.'],
                [KeyRound, 'One-time key reveal', 'Keys are fingerprinted at rest, so a leak of our database is not a leak of your key.'],
              ].map(([Icon, title, description]) => {
                const ItemIcon = Icon as typeof Layers3;
                return (
                  <article key={title as string} className="rounded-2xl border border-white/7 bg-white/[0.02] p-5">
                    <ItemIcon className="h-5 w-5 text-violet-300" />
                    <h3 className="mt-4 text-sm font-semibold text-white">{title as string}</h3>
                    <p className="mt-2 text-xs leading-6 text-slate-500">{description as string}</p>
                  </article>
                );
              })}
            </div>

            <div className="mt-10 rounded-2xl border border-white/7 bg-white/[0.02] p-7 text-center">
              <h3 className="text-xl font-semibold tracking-tight text-white">Ready to send your first one?</h3>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">
                Create a project, copy the key, and run the request from step 2.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <GetApiKeyCta />
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.06]"
                >
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>

      <PublicFooter />
    </div>
  );
}
