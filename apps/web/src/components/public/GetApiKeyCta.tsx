"use client";

import Link from 'next/link';
import { ArrowRight, KeyRound, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

/**
 * The guide's primary action. Signed-out readers are sent to create an account
 * (where they get a key); signed-in readers go straight to their projects.
 */
export function GetApiKeyCta({ className = '' }: { className?: string }) {
  const { user, loading } = useAuth();
  const base = `public-primary-cta inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500 ${className}`;

  if (loading) {
    return <div className={`h-12 w-48 animate-pulse rounded-xl bg-white/[0.05] ${className}`} aria-label="Loading account" />;
  }

  if (user) {
    return (
      <Link href="/dashboard" className={base}>
        <LayoutDashboard className="h-4 w-4" />
        Open your dashboard
      </Link>
    );
  }

  return (
    <Link href="/register" className={base}>
      <KeyRound className="h-4 w-4" />
      Get your API key
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
