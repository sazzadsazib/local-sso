import { renderNavbar } from './components/navbar';
import { renderProjectsView } from './views/projects';
import { renderConfigView } from './views/config';
import { renderUsersView } from './views/users';
import { renderLoginView } from './views/login';
import { renderExamplesView } from './views/examples';
import { getPKCEState, saveSession, clearPKCEState, saveActiveProject, getActiveProject } from './storage';
import { exchangeToken } from './api';
import { showToast } from './components/toast';
import { icon } from './components/icons';
import { initCardTilt } from './components/tilt';
import { initCursorGlow } from './components/glow';

const app = document.getElementById('app')!;

async function handleCallbackIfPresent(): Promise<boolean> {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');
  const errorDesc = urlParams.get('error_description');

  if (error) {
    showToast(`Auth error: ${errorDesc || error}`, 'error', 6000);
    window.history.replaceState({}, document.title, window.location.pathname + '#login');
    return false;
  }

  if (code) {
    const pkce = getPKCEState();
    const project = getActiveProject();
    const effectiveOrigin = (project.host && project.host.trim())
      ? project.host.trim().replace(/\/+$/, '')
      : window.location.origin;
    const tenant = pkce?.tenant || project.tenant || 'common';
    const tokenUrl = `${effectiveOrigin}/${tenant}/oauth2/v2.0/token`;

    // Render interactive visual callback card
    app.innerHTML = `
      ${renderNavbar('login')}
      <main class="flex-1 flex items-center justify-center p-6">
        <div class="glass-panel glass-hero p-8 rounded-3xl max-w-lg w-full text-center space-y-6">
          <div class="w-16 h-16 rounded-2xl bg-sky-500/20 text-sky-400 mx-auto flex items-center justify-center text-2xl shadow-lg border border-sky-500/30">
            <svg class="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
          </div>
          <div>
            <h1 class="text-xl font-bold text-white">Completing Single Sign-On...</h1>
            <p class="text-xs text-slate-400 mt-1">Exchanging authorization code and establishing user session.</p>
          </div>

          <div class="text-left space-y-2.5 text-xs font-mono bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
            <div id="cb-step-1" class="flex items-center gap-2 text-emerald-400">
              ${icon('check-circle', 'w-3.5 h-3.5 shrink-0')} <span>Authorization Code Received (${code.substring(0, 12)}...)</span>
            </div>
            <div id="cb-step-2" class="flex items-center gap-2 text-emerald-400">
              ${icon('check-circle', 'w-3.5 h-3.5 shrink-0')} <span>PKCE S256 Verifier Matched</span>
            </div>
            <div id="cb-step-3" class="flex items-center gap-2 text-sky-400 animate-pulse">
              ${icon('loader', 'w-3.5 h-3.5 shrink-0 animate-spin')} <span>Redeeming Tokens at /oauth2/v2.0/token...</span>
            </div>
            <div id="cb-step-4" class="flex items-center gap-2 text-slate-600">
              ${icon('circle', 'w-3.5 h-3.5 shrink-0')} <span>Storing Session in localStorage</span>
            </div>
          </div>
        </div>
      </main>
    `;

    try {
      const tokenResp = await exchangeToken(tokenUrl, {
        grant_type: 'authorization_code',
        client_id: project.clientId,
        code: code,
        code_verifier: pkce?.verifier || '',
        redirect_uri: `${origin}/callback`,
      });

      const step3 = document.getElementById('cb-step-3');
      const step4 = document.getElementById('cb-step-4');
      if (step3) {
        step3.className = 'flex items-center gap-2 text-emerald-400';
        step3.innerHTML = `${icon('check-circle', 'w-3.5 h-3.5 shrink-0')} <span>RS256 ID &amp; Access Tokens Issued</span>`;
      }
      if (step4) {
        step4.className = 'flex items-center gap-2 text-emerald-400';
        step4.innerHTML = `${icon('check-circle', 'w-3.5 h-3.5 shrink-0')} <span>Session Established in localStorage</span>`;
      }

      saveSession(tokenResp);
      clearPKCEState();
      showToast('Successfully authenticated! Session generated.', 'success');

      // Brief delay so user sees confirmation steps
      await new Promise((resolve) => setTimeout(resolve, 600));
    } catch (err: any) {
      showToast(`Token exchange failed: ${err.message}`, 'error', 8000);
    } finally {
      window.history.replaceState({}, document.title, window.location.pathname + '#login');
      return true;
    }
  }

  return false;
}

function handleDeepLink() {
  const hash = window.location.hash;
  if (hash.includes('?')) {
    const queryPart = hash.split('?')[1];
    const params = new URLSearchParams(queryPart);
    const cfg = params.get('cfg');
    const auto = params.get('auto');

     if (cfg) {
       try {
         const decoded = JSON.parse(atob(cfg.replace(/-/g, '+').replace(/_/g, '/')));
         saveActiveProject(decoded);
         showToast('Imported project from launcher link');
       } catch (e) {
         console.error('Failed to parse cfg deep link', e);
       }
     }

    if (auto === '1') {
      window.location.hash = '#login';
      setTimeout(() => {
        const btn = document.getElementById('btnStartAuth');
        btn?.click();
      }, 300);
    }
  }
}

async function route() {
  const handled = await handleCallbackIfPresent();
  if (handled) {
    // Re-render router on #login view
    window.location.hash = '#login';
  }

  handleDeepLink();

   let hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
   if (!hash || (hash !== 'projects' && hash !== 'config' && hash !== 'users' && hash !== 'login' && hash !== 'examples')) {
     hash = 'projects';
     window.location.hash = '#projects';
   }

  app.innerHTML = `
    ${renderNavbar(hash)}
    <main id="view-container" class="flex-1"></main>
    <footer class="border-t border-white/10 bg-black/40 backdrop-blur-md">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <span class="text-slate-500">local-sso &mdash; Local Entra ID (OIDC) Provider &amp; SSO Playground</span>
        <span class="flex items-center gap-1.5 text-slate-500">
          Developed by
          <a href="https://github.com/sazzadsazib" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-slate-300 hover:text-orange-400 transition-colors font-medium">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.5 9.5 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.86V21c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>
            Sazzad Sazib
            <span class="text-slate-500 font-mono">@sazzadsazib</span>
          </a>
        </span>
      </div>
    </footer>
  `;

  const viewContainer = document.getElementById('view-container')!;

   switch (hash) {
     case 'projects':
       renderProjectsView(viewContainer);
       break;
     case 'config':
       renderConfigView(viewContainer);
       break;
     case 'users':
       await renderUsersView(viewContainer);
       break;
     case 'login':
       await renderLoginView(viewContainer);
       break;
     case 'examples':
       renderExamplesView(viewContainer);
       break;
   }
}

window.addEventListener('hashchange', () => {
  route();
});

// Initial boot
route();
initCardTilt();
initCursorGlow();
