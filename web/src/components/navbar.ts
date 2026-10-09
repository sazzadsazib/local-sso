import { icon, dot } from './icons';

export function renderNavbar(activeTab: string): string {
  const tabs = [
    { id: 'projects', label: 'Projects', icon: 'folder' as const, hash: '#projects' },
    { id: 'config', label: 'Endpoints & Config', icon: 'settings' as const, hash: '#config' },
    { id: 'users', label: 'Mock Users', icon: 'users' as const, hash: '#users' },
    { id: 'login', label: 'Test Client', icon: 'rocket' as const, hash: '#login' },
  ];

  return `
    <header class="sticky top-0 z-40 w-full glass-nav">
      <div class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2 sm:gap-3 min-w-0">
        <a href="#config" class="flex items-center gap-2.5 shrink-0 group">
          <span class="logo-mark w-7 h-7 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
            <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 2 4 6v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </span>
          <span class="font-semibold text-[15px] tracking-tight text-white whitespace-nowrap">local-sso</span>
          <span class="hidden lg:inline-flex items-center px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-[10px] font-medium text-slate-400 whitespace-nowrap">Mock Entra ID v2.0</span>
        </a>

        <nav class="flex items-center gap-0.5 sm:gap-1 p-0.5 rounded-lg border border-white/10 bg-white/[0.03] backdrop-blur-md min-w-0 shrink">
          ${tabs
            .map(
              (t) => `
            <a href="${t.hash}" aria-label="${t.label}" title="${t.label}" class="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/25 shadow-sm'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }">
              ${icon(t.icon, 'w-4 h-4 shrink-0')}
              <span class="hidden sm:inline">${t.label}</span>
            </a>
          `
            )
            .join('')}
        </nav>

        <div class="flex items-center gap-3 shrink-0">
          <div class="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.03] text-slate-300 text-xs font-mono">
            <span class="text-emerald-400">${dot('w-1.5 h-1.5')}</span>
            localhost:${window.location.port || '8080'}
          </div>
        </div>
      </div>
    </header>
  `;
}
