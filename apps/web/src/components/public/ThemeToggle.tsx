"use client";

import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'notica-public-theme';

export function ThemeToggle() {
  const toggleTheme = () => {
    const root = document.documentElement;
    const current = root.dataset.publicTheme === 'light' ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';

    root.dataset.publicTheme = next;
    localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="public-theme-toggle inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-2.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
      aria-label="Toggle light or dark color mode"
      title="Toggle color mode"
    >
      <span className="public-show-when-dark inline-flex items-center gap-2">
        <Sun className="h-4 w-4" />
        <span className="hidden lg:inline">Light</span>
      </span>
      <span className="public-show-when-light hidden items-center gap-2">
        <Moon className="h-4 w-4" />
        <span className="hidden lg:inline">Dark</span>
      </span>
    </button>
  );
}

