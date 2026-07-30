"use client";

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LegacyDashboardDocumentationPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/docs');
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <p>
        Redirecting to{' '}
        <Link
          href="/docs"
          className="text-violet-400 transition-colors hover:text-violet-300"
        >
          documentation
        </Link>
        …
      </p>
    </main>
  );
}

