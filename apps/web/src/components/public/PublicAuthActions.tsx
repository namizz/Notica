"use client";

import Link from 'next/link';
import { ArrowRight, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function PublicAuthActions() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="h-9 w-28 animate-pulse rounded-lg bg-white/[0.05]" aria-label="Loading account" />;
  }

  if (user) {
    return (
      <Link
        href="/dashboard"
        className="public-header-cta inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-violet-100"
      >
        <LayoutDashboard className="h-3.5 w-3.5" />
        Dashboard
      </Link>
    );
  }

  return (
    <>
      <Link
        href="/login"
        className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white sm:inline-flex"
      >
        Sign in
      </Link>
      <Link
        href="/register"
        className="public-header-cta inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-violet-100"
      >
        Get started
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </>
  );
}

