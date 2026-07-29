import Link from 'next/link';
import { ArrowRight, Code2 } from 'lucide-react';

export function NoticaMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-violet-500 to-indigo-700 text-white shadow-lg shadow-violet-500/20 ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 40" className="h-full w-full" fill="none">
        <path d="M8 12.5 14 17M32 12.5 26 17M7 27l7-4M33 27l-7-4" stroke="currentColor" strokeWidth="1.5" opacity=".65" />
        <circle cx="7" cy="12" r="2" fill="currentColor" opacity=".9" />
        <circle cx="33" cy="12" r="2" fill="currentColor" opacity=".9" />
        <circle cx="6.5" cy="27.5" r="2" fill="currentColor" opacity=".9" />
        <circle cx="33.5" cy="27.5" r="2" fill="currentColor" opacity=".9" />
        <path
          d="M20 10.5a6 6 0 0 0-6 6v3.4c0 1.7-.6 3.2-1.8 4.4L11 25.5h18l-1.2-1.2a6.2 6.2 0 0 1-1.8-4.4v-3.4a6 6 0 0 0-6-6Z"
          fill="currentColor"
        />
        <path d="M17.4 28.5a3 3 0 0 0 5.2 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="20" cy="10.5" r="1.5" fill="#c4b5fd" />
      </svg>
    </span>
  );
}

export function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Notica home">
      <NoticaMark />
      <span className="text-sm font-bold tracking-[0.22em] text-white">NOTICA</span>
    </Link>
  );
}

export function PublicHeader() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/8 bg-[#070b12]/88 shadow-lg shadow-black/10 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Brand />

          <nav className="hidden items-center gap-7 text-sm text-slate-400 md:flex" aria-label="Main navigation">
            <Link href="/#product" className="transition-colors hover:text-white">Product</Link>
            <Link href="/#how-it-works" className="transition-colors hover:text-white">How it works</Link>
            <Link href="/docs" className="transition-colors hover:text-white">Documentation</Link>
            <Link href="/#security" className="transition-colors hover:text-white">Security</Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-violet-100"
            >
              Get started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>
      <div className="h-16" aria-hidden="true" />
    </>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#05080e]">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="space-y-4">
          <Brand />
          <p className="max-w-sm text-sm leading-6 text-slate-500">
            Notification infrastructure for teams that want reliable delivery without rebuilding queues,
            realtime transport, and channel integrations.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Built for developers
          </div>
        </div>

        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Product</p>
          <div className="flex flex-col gap-3 text-sm text-slate-400">
            <Link href="/#product" className="hover:text-white">Channels</Link>
            <Link href="/#how-it-works" className="hover:text-white">Architecture</Link>
            <Link href="/#security" className="hover:text-white">Security</Link>
            <Link href="/login" className="hover:text-white">Dashboard</Link>
          </div>
        </div>

        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Developers</p>
          <div className="flex flex-col gap-3 text-sm text-slate-400">
            <Link href="/docs" className="hover:text-white">Documentation</Link>
            <Link href="/docs#quickstart" className="hover:text-white">Quickstart</Link>
            <Link href="/docs#api-reference" className="hover:text-white">API reference</Link>
            <a
              href="https://github.com/namizz/Notica"
              className="inline-flex items-center gap-2 hover:text-white"
              target="_blank"
              rel="noreferrer"
            >
              <Code2 className="h-4 w-4" />
              GitHub
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-white/5 px-5 py-5 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} Notica. Developer notification infrastructure.
      </div>
    </footer>
  );
}
