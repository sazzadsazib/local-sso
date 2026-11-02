import React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Icon, Dot, IconName } from './icons';
import { Theme } from '../theme';

export interface TabItem {
  id: string;
  label: string;
  icon: IconName;
  path: '/projects' | '/config' | '/users' | '/examples' | '/login';
}

export const TABS: TabItem[] = [
  { id: 'projects', label: 'Projects', icon: 'folder', path: '/projects' },
  { id: 'config', label: 'Endpoints & Config', icon: 'settings', path: '/config' },
  { id: 'users', label: 'Mock Users', icon: 'users', path: '/users' },
  { id: 'examples', label: 'Integration Guides', icon: 'code', path: '/examples' },
  { id: 'login', label: 'Test Client', icon: 'rocket', path: '/login' },
];

export interface NavbarProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ theme, onToggleTheme }) => {
  const websiteUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <header className="sticky top-0 z-40 w-full glass-nav">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2 sm:gap-3 min-w-0">
        <Link
          to="/config"
          className="flex items-center gap-2.5 shrink-0 group cursor-pointer"
        >
          <span className="logo-mark w-7 h-7 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
            <svg
              className="w-4 h-4 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2 4 6v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </span>
          <span className="font-semibold text-[15px] tracking-tight text-white whitespace-nowrap">local-sso</span>
          <span className="hidden lg:inline-flex items-center px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-[10px] font-medium text-slate-400 whitespace-nowrap">
            Mock Entra ID v2.0
          </span>
        </Link>

        <nav className="flex items-center gap-0.5 sm:gap-1 p-0.5 rounded-lg border border-white/10 bg-white/[0.03] backdrop-blur-md min-w-0 shrink">
          {TABS.map((t) => {
            const isActive = currentPath === t.path || (t.path === '/login' && currentPath === '/callback');
            return (
              <Link
                key={t.id}
                to={t.path}
                aria-label={t.label}
                title={t.label}
                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-orange-500/15 text-orange-400 border border-orange-500/25 shadow-sm'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                <Icon name={t.icon} className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{t.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            title="Toggle theme (Light / Dark)"
            className="p-2 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 hover:text-white transition cursor-pointer flex items-center justify-center"
          >
            {theme === 'light' ? (
              <Icon name="moon" className="w-4 h-4 text-amber-500" />
            ) : (
              <Icon name="sun" className="w-4 h-4 text-amber-400" />
            )}
          </button>
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Website URL: ${websiteUrl}`}
            className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 hover:text-white transition text-xs font-mono cursor-pointer"
          >
            <span className="text-emerald-400">
              <Dot className="w-1.5 h-1.5" />
            </span>
            {websiteUrl}
          </a>
        </div>
      </div>
    </header>
  );
};
