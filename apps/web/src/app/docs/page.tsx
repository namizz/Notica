"use client";

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * The integration guide is now the home page. This keeps older /docs links
 * working, including deep links such as /docs#api-reference.
 */
const sectionAliases: Record<string, string> = {
  overview: 'start',
  quickstart: 'send',
  concepts: 'start',
  'api-reference': 'api',
  'client-sdk': 'receive',
  'web-push': 'push',
  security: 'api-key',
  errors: 'errors',
};

export default function LegacyDocumentationPage() {
  const router = useRouter();

  useEffect(() => {
    const requested = window.location.hash.slice(1);
    const target = sectionAliases[requested] ?? requested;
    router.replace(target ? `/#${target}` : '/');
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-slate-100">
      <p className="text-center text-sm">
        Redirecting to the{' '}
        <Link href="/" className="text-violet-400 transition-colors hover:text-violet-300">
          integration guide
        </Link>
        …
      </p>
    </main>
  );
}
