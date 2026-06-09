"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Layers, Monitor, ShieldCheck, LogOut, User, Bell, Terminal, BookOpen } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const navigation = [
    { name: 'Projects & Keys', href: '/dashboard', icon: Layers },
    { name: 'Delivery Logs', href: '/dashboard/logs', icon: Terminal },
    { name: 'Documentation', href: '/dashboard/docs', icon: BookOpen },
    { name: 'Active Sessions', href: '/dashboard/sessions', icon: Monitor },
    { name: '2FA Security', href: '/dashboard/security', icon: ShieldCheck },
  ];

  return (
    <AuthGuard>
      <div className="flex h-screen bg-[#070b12] text-slate-100 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden md:flex md:w-64 md:flex-col bg-slate-900/40 border-r border-slate-900 backdrop-blur-xl shrink-0">
          <div className="flex h-16 items-center px-6 border-b border-slate-900 gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-md shadow-violet-500/10">
              <span className="font-bold text-white text-sm">N</span>
            </div>
            <span className="font-bold text-lg tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              NOTICA
            </span>
          </div>

          <nav className="flex-1 space-y-1.5 px-4 py-6">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/15'
                      : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User profile footer */}
          <div className="p-4 border-t border-slate-900 flex flex-col gap-3">
            <div className="flex items-center gap-3 px-2 py-1.5">
              <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-violet-400">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-300 truncate">{user?.email}</p>
                <p className="text-[10px] text-slate-500 font-mono capitalize truncate">{user?.role?.toLowerCase()}</p>
              </div>
            </div>

            <button
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-800/80 bg-slate-950/40 hover:bg-rose-950/20 hover:border-rose-900/30 text-slate-400 hover:text-rose-200 text-xs font-semibold transition-all"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Panel Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="h-16 border-b border-slate-900 bg-slate-950/20 backdrop-blur-xl flex items-center justify-between px-6 md:px-8 shrink-0">
            <div className="flex items-center gap-4">
              {/* Mobile logo (visible on small screens) */}
              <div className="flex md:hidden h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500">
                <span className="font-bold text-white text-xs">N</span>
              </div>
              <h1 className="text-sm font-semibold text-slate-400 uppercase tracking-widest md:hidden">Notica</h1>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-900/60 border border-slate-800/60 rounded-full">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[11px] font-medium text-slate-400">API Status: Connected</span>
              </div>
              
              <button className="p-2 rounded-xl text-slate-400 hover:bg-slate-900/60 transition-colors">
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Subpage Router View */}
          <main className="flex-1 overflow-y-auto bg-[#070b12] p-6 md:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
