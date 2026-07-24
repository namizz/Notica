"use client";

import React, { useState } from 'react';
import { 
  BookOpen, 
  Copy, 
  Check, 
  Terminal, 
  Code, 
  ArrowRight, 
  Settings, 
  Cpu, 
  Smartphone, 
  Lock,
  Layers
} from 'lucide-react';

interface CodeSnippetProps {
  code: string;
  language?: string;
}

function CodeSnippet({ code, language = 'javascript' }: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-xl overflow-hidden border border-slate-900 bg-slate-950/80 my-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-900 bg-slate-900/10 text-xs text-slate-500 font-mono">
        <span>{language.toUpperCase()}</span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 py-1 px-2 hover:bg-slate-900 hover:text-slate-200 rounded-md transition-all cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-450" />
              <span className="text-emerald-450">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {/* Code Area */}
      <pre className="p-4 overflow-x-auto text-xs font-mono text-slate-300 leading-relaxed max-h-[350px]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function DocumentationPage() {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', name: '1. Project Overview', icon: BookOpen },
    { id: 'backend-api', name: '2. Backend API Reference', icon: Terminal },
    { id: 'client-sdk', name: '3. Client JS SDK Integration', icon: Code },
    { id: 'web-push', name: '4. Web Push Service Worker', icon: Cpu },
  ];

  const scrollIntoView = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Table of Contents Side Navigation */}
      <aside className="lg:col-span-1 lg:sticky lg:top-8 h-fit space-y-4">
        <div className="bg-slate-900/10 border border-slate-900 p-4 rounded-2xl">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
            Integration Guides
          </h4>
          <nav className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => scrollIntoView(section.id)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-violet-600/10 border border-violet-500/20 text-violet-400'
                      : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {section.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Integration Quick Tips */}
        <div className="bg-slate-900/5 border border-slate-900/40 p-4 rounded-2xl space-y-3">
          <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Quick Architecture Tip
          </h5>
          <p className="text-[11px] text-slate-400 leading-normal">
            For production workflows, keep your <strong>x-api-key</strong> secure on your server backend. 
            Do not expose your master API key directly in client-side code files.
          </p>
        </div>
      </aside>

      {/* Main Documentation Content */}
      <main className="lg:col-span-3 space-y-12">
        {/* SECTION 1: Overview */}
        <section id="overview" className="scroll-mt-6 space-y-4">
          <div className="flex items-center gap-2 text-violet-400">
            <BookOpen className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-widest">Guide #1</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Project Overview & Setup</h2>
          
          <div className="text-slate-300 text-sm leading-relaxed space-y-4">
            <p>
              Notica is a multi-tenant notification infrastructure platform designed to centralize and process 
              your application alerts. Integration is divided into two parts:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-400">
              <li>
                <strong className="text-slate-250">Backend Integration</strong>: Secure server-side REST API calls to identify recipient profiles, trigger notification messages, and manage device tokens using your secure <strong className="text-slate-300">API Key</strong>.
              </li>
              <li>
                <strong className="text-slate-250">Frontend Client Integration</strong>: Give the JavaScript SDK a short-lived, recipient-scoped client token issued by your backend. The SDK uses it for WebSocket connections and browser push registration without exposing your project API key.
              </li>
            </ul>

            <div className="mt-4 p-4 border border-slate-900 bg-slate-950/25 rounded-2xl flex gap-3.5 items-start">
              <Settings className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-bold text-white uppercase tracking-wider">Configure API Credentials</h5>
                <p className="text-xs text-slate-400 mt-1 leading-normal">
                  Retrieve your secure keys under the <strong className="text-slate-300">Projects & Keys</strong> tab in the sidebar. 
                  Each project has a unique API Key. Pass this key in all REST HTTP API calls using the <code>x-api-key</code> header.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: Backend API */}
        <section id="backend-api" className="scroll-mt-6 space-y-6">
          <hr className="border-slate-900" />
          <div className="flex items-center gap-2 text-violet-400">
            <Terminal className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-widest">Guide #2</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Backend REST API Reference</h2>
          
          <div className="space-y-6 text-sm text-slate-300">
            {/* Identify Recipient */}
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">1. Identify/Sync Recipient Profile</h3>
              <p className="text-slate-400 leading-normal">
                Before sending notifications, synchronize your customer profile to create or update their recipient record.
              </p>
              <div className="flex items-center gap-2 text-xs font-mono py-1">
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 font-bold rounded">POST</span>
                <span className="text-slate-350">http://localhost:8000/recipients/identify</span>
              </div>
              <CodeSnippet 
                language="bash"
                code={`curl -X POST http://localhost:8000/recipients/identify \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: your-project-api-key-here" \\
  -d '{
    "externalUserId": "shopper_789",
    "name": "Jane Doe",
    "email": "jane.doe@example.com"
  }'`}
              />
            </div>

            {/* Send Notification */}
            <div className="space-y-2 pt-4">
              <h3 className="text-base font-bold text-white">2. Trigger a Notification</h3>
              <p className="text-slate-400 leading-normal">
                Queue and dispatch a notification. You can direct messages to the in-app drawer feed (<code>IN_APP</code>), browser notification center (<code>WEB_PUSH</code>), or email delivery (<code>EMAIL</code>).
              </p>
              <div className="flex items-center gap-2 text-xs font-mono py-1">
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 font-bold rounded">POST</span>
                <span className="text-slate-350">http://localhost:8000/notifications</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <span className="block text-xs font-bold text-slate-400 mb-2">In-App Channel Payload:</span>
                  <CodeSnippet 
                    language="json"
                    code={`{
  "recipientId": "shopper_789",
  "title": "Order Confirmed!",
  "body": "Your order has been placed successfully.",
  "channel": "IN_APP"
}`}
                  />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 mb-2">Web Push Channel Payload:</span>
                  <CodeSnippet 
                    language="json"
                    code={`{
  "recipientId": "shopper_789",
  "title": "Your Order is Shipped! 🚚",
  "body": "Order #4895 has been dispatched.",
  "channel": "WEB_PUSH"
}`}
                  />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 mb-2">Email Channel Payload:</span>
                  <CodeSnippet 
                    language="json"
                    code={`{
  "recipientId": "shopper_789",
  "title": "Welcome to our store! 👋",
  "body": "Your account has been set up successfully.",
  "channel": "EMAIL"
}`}
                  />
                </div>
              </div>
            </div>

            {/* Issue Client Token */}
            <div className="space-y-2 pt-4">
              <h3 className="text-base font-bold text-white">3. Issue a Browser Client Token</h3>
              <p className="text-slate-400 leading-normal">
                Call this endpoint only from your backend after authenticating your application user. Return the short-lived token to that user&apos;s browser; never return the project API key.
              </p>
              <div className="flex items-center gap-2 text-xs font-mono py-1">
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 font-bold rounded">POST</span>
                <span className="text-slate-350">http://localhost:8000/client-tokens</span>
              </div>
              <CodeSnippet
                language="bash"
                code={`curl -X POST http://localhost:8000/client-tokens \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: your-project-api-key-here" \\
  -d '{
    "recipientId": "shopper_789"
  }'`}
              />
            </div>

            {/* Register Device Tokens */}
            <div className="space-y-2 pt-4">
              <h3 className="text-base font-bold text-white">4. Register Push Subscription</h3>
              <p className="text-slate-400 leading-normal">
                Save the browser push subscription token object to enable Web Push deliveries. This is usually invoked by the client-side Notica SDK.
              </p>
              <div className="flex items-center gap-2 text-xs font-mono py-1">
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 font-bold rounded">POST</span>
                <span className="text-slate-350">http://localhost:8000/device-tokens/register</span>
              </div>
              <CodeSnippet 
                language="json"
                code={`{
  "platform": "WEB",
  "token": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "expirationTime": null,
    "keys": {
      "p256dh": "BLm8yq1...",
      "auth": "W2h4P9..."
    }
  }
}`}
              />
            </div>
          </div>
        </section>

        {/* SECTION 3: Client SDK */}
        <section id="client-sdk" className="scroll-mt-6 space-y-6">
          <hr className="border-slate-900" />
          <div className="flex items-center gap-2 text-violet-400">
            <Code className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-widest">Guide #3</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Client JS SDK Integration</h2>
          
          <div className="text-slate-300 text-sm leading-relaxed space-y-6">
            <p>
              Notica provides a client-side SDK that connects to the WebSockets gateway and automatically registers push notification tokens. You can integrate the SDK using either an **NPM / ES Module** setup or a **CDN Script Tag** setup.
            </p>

            {/* Installation Methods */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900/10 border border-slate-900 p-5 rounded-2xl">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-violet-500"></span>
                  Option A: NPM / ES Module
                </h4>
                <p className="text-xs text-slate-450 leading-relaxed">
                  Best for modern frontend frameworks (React, Next.js, Vue, Svelte). You can install the package directly from git:
                </p>
                <CodeSnippet 
                  language="bash"
                  code="npm install git+https://github.com/namizz/Notica.git#sdk"
                />
                <p className="text-xs text-slate-450 leading-relaxed">
                  Then import it into your JavaScript or TypeScript files:
                </p>
                <CodeSnippet 
                  language="javascript"
                  code="import Notica from '@notica/sdk';"
                />
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-sky-500"></span>
                  Option B: CDN Script Tag
                </h4>
                <p className="text-xs text-slate-450 leading-relaxed">
                  Best for simple HTML pages, WordPress, or templated applications. Include the scripts directly in your HTML header:
                </p>
                <CodeSnippet 
                  language="html"
                  code={`<!-- Socket.io client dependency -->
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>

<!-- Notica Client SDK -->
<script src="http://localhost:8000/sdk/notica.js"></script>`}
                />
              </div>
            </div>

            <div className="space-y-6 pt-4">
              {/* Step 1 */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 rounded-full bg-violet-600/10 border border-violet-500/30 text-violet-400 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  <h4 className="font-bold text-white">Initialize the SDK</h4>
                </div>
                <p className="text-xs text-slate-400 pl-9">
                  Fetch a short-lived client token from your own authenticated backend, then initialize the client library. The project API key must never be placed in browser code.
                </p>
                <div className="pl-9">
                  <CodeSnippet 
                    language="javascript"
code={`// Initialize Notica client
const { clientToken } = await fetch("/api/notica/client-token", {
  method: "POST"
}).then((response) => response.json());

Notica.init({
  clientToken,
  apiUrl: "http://localhost:8000",
  wsUrl: "http://localhost:8000"
});`}
                  />
                </div>
              </div>

              {/* Step 2 */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 rounded-full bg-violet-600/10 border border-violet-500/30 text-violet-400 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  <h4 className="font-bold text-white">Identify Active Recipient User</h4>
                </div>
                <p className="text-xs text-slate-400 pl-9">
                  The client token already identifies the active recipient. Calling identify is optional and only stores a local label for compatibility.
                </p>
                <div className="pl-9">
                  <CodeSnippet 
                    language="javascript"
                    code={`// Identify recipient user ID
Notica.identify("shopper_789");`}
                  />
                </div>
              </div>

              {/* Step 3 */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 rounded-full bg-violet-600/10 border border-violet-500/30 text-violet-400 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                  <h4 className="font-bold text-white">Listen to Real-Time In-App Events</h4>
                </div>
                <p className="text-xs text-slate-400 pl-9">
                  Register callbacks to listen for incoming real-time notifications when the recipient has the app open.
                </p>
                <div className="pl-9">
                  <CodeSnippet 
                    language="javascript"
                    code={`Notica.onNotification((data) => {
  console.log("WebSocket Event: New In-App Notification!", data);
  // data contains: { id, title, body, channel, createdAt }
  
  // Custom logic: e.g. update badge numbers or show toast alerts
  showNotificationToast(data.title, data.body);
});`}
                  />
                </div>
              </div>

              {/* Step 4 */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 rounded-full bg-violet-600/10 border border-violet-500/30 text-violet-400 flex items-center justify-center text-xs font-bold shrink-0">4</span>
                  <h4 className="font-bold text-white">Register Browser Web Push</h4>
                </div>
                <p className="text-xs text-slate-400 pl-9">
                  Enable background Web Push notifications. This prompts the user for permissions, registers a Service Worker, and saves the subscription device token.
                </p>
                <div className="pl-9">
                  <CodeSnippet 
                    language="javascript"
                    code={`// Registers the push subscription, linking it to shopper_789
const success = await Notica.registerPush('/sw.js');

if (success) {
  console.log("Web Push successfully registered and enabled for this browser.");
} else {
  console.warn("Push registration failed. Verify notification permissions or console logs.");
}`}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: Web Push Service Worker */}
        <section id="web-push" className="scroll-mt-6 space-y-6">
          <hr className="border-slate-900" />
          <div className="flex items-center gap-2 text-violet-400">
            <Cpu className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-widest">Guide #4</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Web Push Service Worker Boilerplate</h2>
          
          <div className="text-slate-300 text-sm leading-relaxed space-y-4">
            <p>
              To handle push alerts in the background (even when your application tab is closed), place a Service Worker script file named <code>sw.js</code> in your web application root:
            </p>

            <CodeSnippet 
              language="javascript"
              code={`// public/sw.js

// 1. Handle incoming Push Events
self.addEventListener('push', function (event) {
  console.log('[Service Worker] Push Event received.');

  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Notification', body: event.data.text() };
    }
  }

  const title = data.title || 'New Alert!';
  const options = {
    body: data.body || 'You have a new message.',
    icon: '/images/icon.png', // Add absolute URL or asset reference
    badge: '/images/badge.png',
    data: {
      url: data.url || '/',
      notificationId: data.notificationId,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 2. Handle Notification Click Events
self.addEventListener('notificationclick', function (event) {
  console.log('[Service Worker] Notification click received.', event.notification.data);

  event.notification.close();

  const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      // Focus existing tab if open
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Open a new tab
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});`}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
