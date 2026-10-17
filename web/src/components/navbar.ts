import { icon } from './icons';
import { getTheme, toggleTheme } from '../theme';
import { getProjects, getActiveProject, setActiveProjectId } from '../storage';
import { showToast } from './toast';

export const NAV_ITEMS = [
  { id: 'projects', label: 'Projects', mobile: 'Projects', icon: 'folder', index: '01', eyebrow: 'Workspace overview' },
  { id: 'config', label: 'Endpoints & config', mobile: 'Config', icon: 'sliders', index: '02', eyebrow: 'Project configuration' },
  { id: 'users', label: 'Mock users', mobile: 'Users', icon: 'users', index: '03', eyebrow: 'Directory' },
  { id: 'examples', label: 'Integration guides', mobile: 'Guides', icon: 'code', index: '04', eyebrow: 'Developer resources' },
  { id: 'login', label: 'Auth lab', mobile: 'Auth', icon: 'terminal', index: '05', eyebrow: 'OAuth2 + PKCE' },
];

export const BRAND_LOGO_SVG = `<svg viewBox="0 0 64 64" width="20" height="20" fill="none" role="img" aria-label="local-sso"><g fill="none" stroke="#ffffff" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round"><path d="M32 12 16 19v12c0 10.5 6.8 18.3 16 21 9.2-2.7 16-10.5 16-21V19z"/><path d="m25 31 5 5 9-10"/></g></svg>`;

export function monogram(name: string): string {
  const words = String(name || 'SSO').trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

export function projectOptionsMarkup(): string {
  const projects = getProjects();
  const active = getActiveProject();
  if (!projects.length) {
    return '<option value="">No projects</option>';
  }
  return projects
    .map(
      (p) =>
        `<option value="${p.id}"${p.id === active.id ? ' selected' : ''}>${p.name}</option>`
    )
    .join('');
}

export function renderShell(activeRoute: string): string {
  const activeProject = getActiveProject();
  const currentTheme = getTheme();
  const currentRouteMeta = NAV_ITEMS.find((item) => item.id === activeRoute) || NAV_ITEMS[0];

  const sidebarLinks = NAV_ITEMS.map((item) => {
    const isActive = item.id === activeRoute;
    return `
      <a class="nav-link${isActive ? ' is-active' : ''}" href="#${item.id}" data-nav="${item.id}" aria-label="${item.label}" title="${item.label}"${isActive ? ' aria-current="page"' : ''}>
        ${icon(item.icon, 'w-4 h-4 nav-icon')}
        <span>${item.label}</span>
        <span class="nav-index">${item.index}</span>
      </a>
    `;
  }).join('');

  const mobileLinks = NAV_ITEMS.map((item) => {
    const isActive = item.id === activeRoute;
    return `
      <a class="mobile-nav-link${isActive ? ' is-active' : ''}" href="#${item.id}" data-nav="${item.id}" aria-label="${item.label}"${isActive ? ' aria-current="page"' : ''}>
        ${icon(item.icon, 18, 'mobile-nav-icon')}
        <span>${item.mobile}</span>
      </a>
    `;
  }).join('');

  const sidebarProjectMarkup = activeProject
    ? `
      <a class="sidebar-project" href="#config" aria-label="Open configuration for ${activeProject.name}">
        <span class="sidebar-project-top">
          <span class="project-monogram">${monogram(activeProject.name)}</span>
          <span class="sidebar-project-name">
            <strong>${activeProject.name}</strong>
            <span>${activeProject.tenant} · ${activeProject.issuerMode === 'entra' ? 'Entra issuer' : 'Host issuer'}</span>
          </span>
          ${icon('arrow-up-right', 'w-3.5 h-3.5 sidebar-project-arrow')}
        </span>
      </a>
    `
    : `
      <a class="sidebar-project" href="#projects" aria-label="Create a project">
        <span class="sidebar-project-top">
          <span class="project-monogram">+</span>
          <span class="sidebar-project-name">
            <strong>No active project</strong>
            <span>Create a workspace</span>
          </span>
          ${icon('arrow-up-right', 'w-3.5 h-3.5 sidebar-project-arrow')}
        </span>
      </a>
    `;

  return `
    <aside class="sidebar">
      <a class="brand" href="#projects" aria-label="local-sso home">
        <span class="brand-mark">${BRAND_LOGO_SVG}</span>
        <span class="brand-type">
          <span class="brand-name">local-sso <span class="brand-version">v2.0</span></span>
          <span class="brand-sub">Identity lab</span>
        </span>
      </a>
      <div class="nav-block">
        <div class="nav-label">Workspace</div>
        <nav class="nav-list" aria-label="Primary navigation">
          ${sidebarLinks}
        </nav>
      </div>
      <div class="sidebar-spacer"></div>
      <div id="sidebar-project">
        ${sidebarProjectMarkup}
      </div>
      <div class="sidebar-status">
        <span class="status-dot"></span>
        <span>Local provider · RS256</span>
      </div>
    </aside>

    <div class="shell-main">
      <header class="topbar">
        <a class="topbar-brand" href="#projects" aria-label="local-sso home">
          <span class="brand-mark">${BRAND_LOGO_SVG}</span>
          <strong>local-sso</strong>
        </a>
        <div class="topbar-context">
          <span class="topbar-context-label">Workspace</span>
          <span class="topbar-slash">/</span>
          <span class="topbar-current" id="topbar-current">${currentRouteMeta.label}</span>
        </div>
        <div class="topbar-tools">
          <label class="project-picker" for="globalProjectSelect">
            <span class="project-picker-label">Context</span>
            <select id="globalProjectSelect" aria-label="Active project">
              ${projectOptionsMarkup()}
            </select>
          </label>
          <button type="button" class="icon-button" id="themeToggleBtn" aria-label="Switch theme" title="Switch theme">
            ${icon(currentTheme === 'light' ? 'moon' : 'sun', 'w-5 h-5')}
          </button>
        </div>
      </header>

      <main class="main" id="main-content" tabindex="-1"></main>

      <footer class="footer">
        <span><strong>local-sso</strong> — local Entra ID provider &amp; SSO playground</span>
        <span class="footer-meta">
          <span>Built by</span>
          <a href="https://github.com/sazzadsazib" target="_blank" rel="noopener noreferrer">Sazzad Sazib</a>
          <span>·</span>
          <span>Mock data stays in your browser</span>
        </span>
      </footer>
    </div>

    <nav class="mobile-nav" aria-label="Primary navigation">
      ${mobileLinks}
    </nav>
  `;
}

export function bindShellEvents(onRouteChange: () => void) {
  const projectSelect = document.getElementById('globalProjectSelect') as HTMLSelectElement | null;
  if (projectSelect) {
    projectSelect.addEventListener('change', () => {
      setActiveProjectId(projectSelect.value);
      showToast(`Switched active project: ${getActiveProject().name}`, 'info');
      onRouteChange();
    });
  }

  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = toggleTheme();
      showToast(`Switched to ${next} theme`, 'info');
      onRouteChange();
    });
  }
}
