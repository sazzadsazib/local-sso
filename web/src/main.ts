import { renderShell, bindShellEvents } from './components/navbar';
import { renderProjectsView } from './views/projects';
import { renderConfigView } from './views/config';
import { renderUsersView } from './views/users';
import { renderLoginView } from './views/login';
import { renderExamplesView } from './views/examples';
import { getPKCEState, saveSession, clearPKCEState, saveActiveProject, getActiveProject } from './storage';
import { exchangeToken, decodeJWT } from './api';
import { showToast } from './components/toast';
import { icon } from './components/icons';
import { getTheme, applyTheme } from './theme';

const app = document.getElementById('app')!;

function escapeHtml(str: string | undefined | null): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function handleCallbackIfPresent(): Promise<boolean> {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');
  const errorDesc = urlParams.get('error_description');

  if (error) {
    window.history.replaceState({}, document.title, window.location.origin + '/#login');
    app.innerHTML = `
      <main class="cb-container">
        <div class="cb-card">
          <div class="cb-badge is-error">
            ${icon('alert', 'w-7 h-7')}
          </div>
          <h2 class="modal-title">Sign-in Cancelled</h2>
          <p class="modal-description">${escapeHtml(errorDesc || error || 'The sign-in request was cancelled or access was denied.')}</p>
          <div style="margin-top:20px;">
            <a href="#login" class="btn btn-primary" id="btnCbBack">Return to Auth Lab</a>
          </div>
        </div>
      </main>
    `;
    document.getElementById('btnCbBack')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = '#login';
      renderRoute();
    });
    return true;
  }

  if (code) {
    const pkce = getPKCEState();
    const project = getActiveProject();
    const effectiveOrigin = (project.host && project.host.trim())
      ? project.host.trim().replace(/\/+$/, '')
      : window.location.origin;
    const tenant = pkce?.tenant || project.tenant || 'common';
    const tokenUrl = `${effectiveOrigin}/${tenant}/oauth2/v2.0/token`;

    // Render visual callback animation card with liquid glass and animated spinner
    app.innerHTML = `
      <main class="cb-container">
        <div class="cb-card">
          <div class="cb-badge" id="cbBadge">
            ${icon('loader', 'w-7 h-7 animate-spin', 2.2)}
          </div>
          <h2 class="modal-title" id="cbTitle">Completing sign-in...</h2>
          <p class="modal-description" id="cbDesc">Exchanging authorization code and establishing token session.</p>

          <div class="cb-steps">
            <div id="cb-step-1" class="cb-step-item is-done">
              <span class="cb-step-icon">${icon('check-circle', 'w-4 h-4')}</span>
              <span>Authorization code received (${escapeHtml(code.substring(0, 12))}…)</span>
            </div>
            <div id="cb-step-2" class="cb-step-item is-done">
              <span class="cb-step-icon">${icon('check-circle', 'w-4 h-4')}</span>
              <span>PKCE S256 verifier validated</span>
            </div>
            <div id="cb-step-3" class="cb-step-item is-active">
              <span class="cb-step-icon" id="cb-icon-3">${icon('loader', 'w-4 h-4 animate-spin', 2)}</span>
              <span id="cb-text-3">Redeeming tokens at /oauth2/v2.0/token…</span>
            </div>
            <div id="cb-step-4" class="cb-step-item">
              <span class="cb-step-icon" id="cb-icon-4">${icon('circle', 'w-4 h-4')}</span>
              <span id="cb-text-4">Establishing session in browser</span>
            </div>
          </div>

          <div id="cbActionArea" style="display:none; margin-top:20px;"></div>
        </div>
      </main>
    `;

    try {
      const tokenResp = await exchangeToken(tokenUrl, {
        grant_type: 'authorization_code',
        client_id: project.clientId,
        client_secret: project.clientSecret || 'local-sso-secret',
        code: code,
        code_verifier: pkce?.verifier || '',
        redirect_uri: `${window.location.origin}/callback`,
      });

      const icon3 = document.getElementById('cb-icon-3');
      const text3 = document.getElementById('cb-text-3');
      const step3 = document.getElementById('cb-step-3');
      const icon4 = document.getElementById('cb-icon-4');
      const text4 = document.getElementById('cb-text-4');
      const step4 = document.getElementById('cb-step-4');
      const badge = document.getElementById('cbBadge');
      const title = document.getElementById('cbTitle');
      const desc = document.getElementById('cbDesc');

      if (step3 && icon3 && text3) {
        step3.className = 'cb-step-item is-done';
        icon3.innerHTML = icon('check-circle', 'w-4 h-4');
        text3.textContent = 'RS256 ID & Access tokens issued';
      }
      if (step4 && icon4 && text4) {
        step4.className = 'cb-step-item is-done';
        icon4.innerHTML = icon('check-circle', 'w-4 h-4');
        text4.textContent = 'Session established in localStorage';
      }
      if (badge) {
        badge.className = 'cb-badge is-success';
        badge.innerHTML = icon('check', 'w-7 h-7', 3);
      }
      if (title) title.textContent = 'Authenticated!';
      if (desc) desc.textContent = 'Redirecting to your active session inspector…';

      const decoded = decodeJWT(tokenResp.id_token) || decodeJWT(tokenResp.access_token);
      if (decoded && decoded.payload) {
        tokenResp.name = decoded.payload.name || decoded.payload.preferred_username;
        tokenResp.email = decoded.payload.email || decoded.payload.preferred_username;
        tokenResp.user_id = decoded.payload.oid || decoded.payload.sub;
        tokenResp.tid = decoded.payload.tid || project.tenant;
        tokenResp.id_claims = decoded.payload;
      }

      saveSession(tokenResp);
      clearPKCEState();
      showToast('Successfully authenticated! Active session ready.', 'success');

      await new Promise((resolve) => setTimeout(resolve, 600));
      window.history.replaceState({}, document.title, window.location.origin + '/#login');
      return true;
    } catch (err: any) {
      const icon3 = document.getElementById('cb-icon-3');
      const text3 = document.getElementById('cb-text-3');
      const step3 = document.getElementById('cb-step-3');
      const badge = document.getElementById('cbBadge');
      const title = document.getElementById('cbTitle');
      const desc = document.getElementById('cbDesc');
      const actionArea = document.getElementById('cbActionArea');

      if (step3 && icon3 && text3) {
        step3.className = 'cb-step-item is-error';
        icon3.innerHTML = icon('alert', 'w-4 h-4');
        text3.textContent = `Token exchange failed: ${err.message || 'Error'}`;
      }
      if (badge) {
        badge.className = 'cb-badge is-error';
        badge.innerHTML = icon('close', 'w-7 h-7', 2.5);
      }
      if (title) title.textContent = 'Exchange Failed';
      if (desc) desc.textContent = 'Authorization codes are single-use with a 5-minute TTL. If already redeemed or expired, please start a fresh sign-in.';

      if (actionArea) {
        actionArea.style.display = 'block';
        actionArea.innerHTML = `
          <button type="button" class="btn btn-primary" id="btnCbRetry" style="width:100%;">Return to Auth Lab</button>
        `;
        document.getElementById('btnCbRetry')?.addEventListener('click', () => {
          window.history.replaceState({}, document.title, window.location.origin + '/#login');
          window.location.hash = '#login';
          renderRoute();
        });
      }

      showToast(`Token exchange failed: ${err.message}`, 'error', 8000);
      return new Promise<boolean>(() => {});
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
        showToast('Imported project configuration from URL');
      } catch (e) {
        console.error('Failed to parse cfg deep link', e);
      }
    }

    if (auto === '1') {
      window.location.hash = '#login';
      setTimeout(() => {
        const btn = document.getElementById('btnLaunchAuthFlow');
        btn?.click();
      }, 300);
    }
  }
}

let isRendering = false;

async function renderRoute() {
  if (isRendering) return;
  isRendering = true;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('code') || urlParams.get('error')) {
      app.className = 'cb-fullscreen-shell';
      const handled = await handleCallbackIfPresent();
      app.className = 'app-shell';
      if (handled) {
        window.history.replaceState({}, document.title, window.location.origin + '/#login');
        window.location.hash = '#login';
      }
    }

    handleDeepLink();

    let hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
    if (!hash || (hash !== 'projects' && hash !== 'config' && hash !== 'users' && hash !== 'login' && hash !== 'examples')) {
      hash = 'projects';
      window.location.hash = '#projects';
    }

    // Ensure full application shell layout
    app.className = 'app-shell';
    app.innerHTML = renderShell(hash);
    bindShellEvents(() => renderRoute());

    const viewContainer = document.getElementById('main-content')!;

    switch (hash) {
      case 'projects':
        renderProjectsView(viewContainer, () => renderRoute());
        break;
      case 'config':
        renderConfigView(viewContainer, () => renderRoute());
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
  } finally {
    isRendering = false;
  }
}

window.addEventListener('hashchange', () => {
  renderRoute();
});

// Boot
applyTheme(getTheme());
renderRoute();
