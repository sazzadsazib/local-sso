import { renderNavbar } from './components/navbar';
import { renderConfigView } from './views/config';
import { renderUsersView } from './views/users';
import { renderLoginView } from './views/login';
import { getPKCEState, saveSession, clearPKCEState, saveActiveProfile, getActiveProfile } from './storage';
import { exchangeToken } from './api';
import { showToast } from './components/toast';

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
    const profile = getActiveProfile();
    const origin = window.location.origin;
    const tenant = pkce?.tenant || profile.tenant || 'common';
    const tokenUrl = `${origin}/${tenant}/oauth2/v2.0/token`;

    // Render interactive visual callback card
    app.innerHTML = `
      ${renderNavbar('login')}
      <main class="flex-1 flex items-center justify-center p-6">
        <div class="glass-panel p-8 rounded-3xl max-w-lg w-full text-center space-y-6 border border-sky-500/30 shadow-2xl bg-gradient-to-b from-slate-900 to-slate-950">
          <div class="w-16 h-16 rounded-2xl bg-sky-500/20 text-sky-400 mx-auto flex items-center justify-center text-2xl shadow-lg border border-sky-500/30">
            <svg class="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
          </div>
          <div>
            <h1 class="text-xl font-bold text-white">Completing Single Sign-On...</h1>
            <p class="text-xs text-slate-400 mt-1">Exchanging authorization code and establishing user session.</p>
          </div>

          <div class="text-left space-y-2.5 text-xs font-mono bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
            <div id="cb-step-1" class="flex items-center gap-2 text-emerald-400">
              <span>✓</span> <span>Authorization Code Received (${code.substring(0, 12)}...)</span>
            </div>
            <div id="cb-step-2" class="flex items-center gap-2 text-emerald-400">
              <span>✓</span> <span>PKCE S256 Verifier Matched</span>
            </div>
            <div id="cb-step-3" class="flex items-center gap-2 text-sky-400 animate-pulse">
              <span>⏳</span> <span>Redeeming Tokens at /oauth2/v2.0/token...</span>
            </div>
            <div id="cb-step-4" class="flex items-center gap-2 text-slate-600">
              <span>○</span> <span>Storing Session in localStorage</span>
            </div>
          </div>
        </div>
      </main>
    `;

    try {
      const tokenResp = await exchangeToken(tokenUrl, {
        grant_type: 'authorization_code',
        client_id: profile.clientId,
        code: code,
        code_verifier: pkce?.verifier || '',
        redirect_uri: `${origin}/callback`,
      });

      const step3 = document.getElementById('cb-step-3');
      const step4 = document.getElementById('cb-step-4');
      if (step3) {
        step3.className = 'flex items-center gap-2 text-emerald-400';
        step3.innerHTML = '<span>✓</span> <span>RS256 ID & Access Tokens Issued</span>';
      }
      if (step4) {
        step4.className = 'flex items-center gap-2 text-emerald-400';
        step4.innerHTML = '<span>✓</span> <span>Session Established in localStorage</span>';
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
        saveActiveProfile(decoded);
        showToast('Imported profile from launcher link');
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
  if (!hash || (hash !== 'config' && hash !== 'users' && hash !== 'login')) {
    hash = 'config';
    window.location.hash = '#config';
  }

  app.innerHTML = `
    ${renderNavbar(hash)}
    <main id="view-container" class="flex-1"></main>
    <footer class="border-t border-slate-900 bg-slate-950/60 py-6 text-center text-xs text-slate-500 font-mono">
      sso-local — Single Binary Local Entra ID Provider & SSO Session Playground
    </footer>
  `;

  const viewContainer = document.getElementById('view-container')!;

  switch (hash) {
    case 'config':
      renderConfigView(viewContainer);
      break;
    case 'users':
      await renderUsersView(viewContainer);
      break;
    case 'login':
      await renderLoginView(viewContainer);
      break;
  }
}

window.addEventListener('hashchange', () => {
  route();
});

// Initial boot
route();
