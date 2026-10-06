export function renderNavbar(activeTab: string): string {
  const tabs = [
    { id: 'config', label: 'Endpoints & Config', icon: '⚙️', hash: '#config' },
    { id: 'users', label: 'Mock Users', icon: '👥', hash: '#users' },
    { id: 'login', label: 'Test Client', icon: '🚀', hash: '#login' },
  ];

  return `
    <header class="sticky top-0 z-40 w-full glass-panel border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 font-bold text-white text-lg">
            S
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-bold text-base bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">sso-local</span>
              <span class="px-2 py-0.5 text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-full">Mock Entra ID v2.0</span>
            </div>
            <span class="text-xs text-slate-500 hidden sm:inline">Local OIDC & OAuth2 Server</span>
          </div>
        </div>

        <nav class="flex items-center gap-1 sm:gap-2">
          ${tabs
            .map(
              (t) => `
            <a href="${t.hash}" class="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === t.id
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }">
              <span>${t.icon}</span>
              <span>${t.label}</span>
            </a>
          `
            )
            .join('')}
        </nav>

        <div class="flex items-center gap-3">
          <div class="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            127.0.0.1:${window.location.port || '8080'}
          </div>
        </div>
      </div>
    </header>
  `;
}
