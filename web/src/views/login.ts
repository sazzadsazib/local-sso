import { getActiveProject, getSession, saveSession, clearSession, savePKCEState } from '../storage';
import { decodeJWT, exchangeToken, verifyIDToken, fetchMockUsers } from '../api';
import { showToast } from '../components/toast';
import { icon } from '../components/icons';
import { PKCEState, MockUser } from '../types';

async function generatePKCE() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = base64UrlEncode(array);

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const challenge = base64UrlEncode(new Uint8Array(hash));

  const stateArr = new Uint8Array(16);
  crypto.getRandomValues(stateArr);
  const state = base64UrlEncode(stateArr);

  const nonceArr = new Uint8Array(16);
  crypto.getRandomValues(nonceArr);
  const nonce = base64UrlEncode(nonceArr);

  return { verifier, challenge, state, nonce };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function renderLoginView(container: HTMLElement) {
  const project = getActiveProject();
  const session = getSession();
  const effectiveOrigin = (project.host && project.host.trim())
    ? project.host.trim().replace(/\/+$/, '')
    : window.location.origin;
  const tenant = project.tenant || 'common';

  let mockUsers: MockUser[] = [];
  try {
    mockUsers = await fetchMockUsers();
  } catch (e) {
    console.error('Failed to fetch mock users', e);
  }

  if (!session) {
    // Empty state: interactive in-app test console
    container.innerHTML = `
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        
        <!-- Header -->
        <div class="glass-panel glass-hero p-8 rounded-3xl text-center space-y-4 max-w-3xl mx-auto">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 mx-auto flex items-center justify-center text-3xl shadow-lg shadow-sky-500/20">
            ${icon('rocket', 'w-7 h-7 text-white')}
          </div>
          <div class="space-y-1">
            <h1 class="text-2xl sm:text-3xl font-extrabold text-white">OAuth2 / OIDC In-App Test Client</h1>
            <p class="text-sm text-slate-400">Test the local Microsoft Entra ID (PKCE S256) authorization flow directly in your browser without writing any frontend code.</p>
          </div>
        </div>

        <!-- Testing Console Grid -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-8 max-w-4xl mx-auto">
          
          <!-- Test Parameters Form -->
          <div class="md:col-span-7 glass-panel glass-hover p-6 rounded-2xl space-y-5">
            <h2 class="text-base font-bold text-white flex items-center gap-2">
              ${icon('settings', 'w-4 h-4 text-orange-400')} Authentication Parameters
            </h2>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5">Sign in as Mock User (login_hint)</label>
                <select id="selectTestUser" class="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-sky-500 focus:outline-none">
                  <option value="">None (interactive picker / default)</option>
                  ${mockUsers
                    .map(
                      (u) =>
                        `<option value="${u.email}">${u.name} (${u.email}) [${(u.roles || ['User']).join(', ')}]</option>`
                    )
                    .join('')}
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5">Requested OAuth Scopes</label>
                <input id="inputTestScope" type="text" value="${project.scope}" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-slate-400 mb-1.5">Prompt Mode (prompt)</label>
                  <select id="selectTestPrompt" class="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:outline-none">
                    <option value="select_account" selected>select_account &mdash; Account Picker</option>
                    <option value="consent">consent &mdash; Permissions & Consent</option>
                    <option value="none">none &mdash; Silent / Instant Auto-Login</option>
                    <option value="login">login &mdash; Re-authentication</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-400 mb-1.5">PKCE Method</label>
                  <input type="text" value="S256 (SHA-256)" disabled class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-slate-400 cursor-not-allowed" />
                </div>
              </div>

              <!-- Live Authorize URL Preview -->
              <div class="p-3 bg-slate-950/70 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
                <div class="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center justify-between">
                  <span>Authorize Request Preview</span>
                  <span id="previewPromptTag" class="text-sky-400 font-semibold lowercase">prompt=select_account</span>
                </div>
                <div id="liveAuthUrlPreview" class="text-sky-300 break-all select-all font-mono leading-relaxed text-[11px]">
                  /${tenant}/oauth2/v2.0/authorize?prompt=select_account
                </div>
              </div>
            </div>

            <div class="pt-3 space-y-2">
              <button id="btnStartAuth" class="w-full py-3.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold rounded-xl transition shadow-xl shadow-sky-500/25 flex items-center justify-center gap-2 text-sm">
                ${icon('zap', 'w-4 h-4')} Launch OAuth2 + PKCE Test Flow
              </button>
            </div>
          </div>

          <!-- Flow Summary & Info -->
          <div class="md:col-span-5 glass-panel glass-hover p-6 rounded-2xl space-y-4 flex flex-col justify-between">
            <div>
              <h2 class="text-base font-bold text-white mb-3 flex items-center gap-2">
                ${icon('search', 'w-4 h-4 text-orange-400')} Flow Execution Steps
              </h2>
              <ol class="space-y-3 text-xs text-slate-300">
                <li class="flex items-start gap-2.5">
                  <span class="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                  <span>Browser generates cryptographic <strong>PKCE code_verifier</strong> and <strong>S256 challenge</strong>.</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <span class="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                  <span>Redirects to local Entra authorize endpoint (<code class="text-sky-300 font-mono">/oauth2/v2.0/authorize</code>).</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <span class="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                  <span>User identity is selected and authorization code is issued to <code class="text-sky-300 font-mono">/callback</code>.</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <span class="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">4</span>
                  <span>Code + verifier exchanged at token endpoint for signed RS256 <strong>ID & Access tokens</strong>.</span>
                </li>
              </ol>
            </div>

            <div class="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400">
              <span class="flex items-center gap-1.5 text-emerald-400 font-semibold mb-0.5">${icon('check-circle', 'w-3.5 h-3.5')} Target Authority</span>
              <span class="text-slate-300 truncate block">${effectiveOrigin}/${tenant}</span>
            </div>
          </div>

        </div>

      </div>
    `;

    const userSelect = document.getElementById('selectTestUser') as HTMLSelectElement | null;
    const promptSelect = document.getElementById('selectTestPrompt') as HTMLSelectElement | null;
    const scopeInput = document.getElementById('inputTestScope') as HTMLInputElement | null;
    const previewPromptTag = document.getElementById('previewPromptTag');
    const liveAuthUrlPreview = document.getElementById('liveAuthUrlPreview');

    const updateAuthPreview = () => {
      const selectedEmail = userSelect?.value || '';
      const prompt = promptSelect?.value || 'select_account';
      if (previewPromptTag) {
        previewPromptTag.textContent = `prompt=${prompt}${selectedEmail ? ' · ' + selectedEmail : ''}`;
      }
      if (liveAuthUrlPreview) {
        let preview = `/${tenant}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(
          project.clientId
        )}&response_type=code&prompt=${encodeURIComponent(prompt)}`;
        if (selectedEmail) {
          preview += `&login_hint=${encodeURIComponent(selectedEmail)}`;
        }
        liveAuthUrlPreview.textContent = preview;
      }
    };

    userSelect?.addEventListener('change', updateAuthPreview);
    promptSelect?.addEventListener('change', updateAuthPreview);
    scopeInput?.addEventListener('input', updateAuthPreview);
    updateAuthPreview();

    document.getElementById('btnStartAuth')?.addEventListener('click', async () => {
      const selectedEmail = (document.getElementById('selectTestUser') as HTMLSelectElement).value;
      const scope = (document.getElementById('inputTestScope') as HTMLInputElement).value;
      const prompt = (document.getElementById('selectTestPrompt') as HTMLSelectElement).value;

      const { verifier, challenge, state, nonce } = await generatePKCE();
      const pkceState: PKCEState = {
        verifier,
        challenge,
        state,
        nonce,
        createdAt: Date.now(),
        tenant,
      };
      savePKCEState(pkceState);

      const redirectUri = `${window.location.origin}/callback`;
      let authUrl = `${effectiveOrigin}/${tenant}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(
        project.clientId
      )}&response_type=code&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_mode=query&scope=${encodeURIComponent(
        scope
      )}&state=${encodeURIComponent(state)}&nonce=${encodeURIComponent(
        nonce
      )}&code_challenge=${encodeURIComponent(
        challenge
      )}&code_challenge_method=S256&prompt=${encodeURIComponent(prompt)}`;

      if (selectedEmail) {
        authUrl += `&login_hint=${encodeURIComponent(selectedEmail)}`;
      }

      window.location.href = authUrl;
    });

    return;
  }

  // Active Session View
  const decodedId = session.id_token ? decodeJWT(session.id_token) : null;
  const decodedAccess = session.access_token ? decodeJWT(session.access_token) : null;

  const authBearerCurl = `curl -X GET "${effectiveOrigin}/${tenant}/oidc/userinfo" \\
  -H "Authorization: Bearer ${session.access_token}"`;

  container.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      <!-- Session Header Card -->
      <div class="glass-panel glass-success p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center gap-4 min-w-0 flex-1">
          <div class="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            ${icon('check', 'w-7 h-7', 2.5)}
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-xl font-bold text-white break-words min-w-0">${decodedId?.payload?.name || 'Active SSO Session'}</h1>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">Session Active</span>
            </div>
            <p class="text-xs text-slate-400 font-mono mt-0.5 break-all">${decodedId?.payload?.preferred_username || decodedId?.payload?.email || 'Authenticated User'}</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button id="btnVerify" class="px-4 py-2 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-semibold rounded-xl border border-sky-500/30 transition flex items-center gap-1.5 shadow-sm">
            ${icon('shield', 'w-3.5 h-3.5')} Verify JWKS Signature
          </button>
          <button id="btnRefresh" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center gap-1.5">
            ${icon('refresh', 'w-3.5 h-3.5')} Test Token Refresh
          </button>
          <button id="btnLogout" class="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold rounded-xl border border-rose-500/30 transition">
            Sign Out
          </button>
        </div>
      </div>

      <!-- Verification Result Alert (if triggered) -->
      <div id="verifyAlert" class="hidden p-4 rounded-2xl border text-xs font-mono"></div>

      <!-- User Identity Breakdown -->
      <div class="tilt-card glass-panel glass-hover p-6 rounded-2xl space-y-3">
        <h2 class="text-sm font-bold text-white flex items-center gap-2">
          ${icon('user', 'w-4 h-4 text-orange-400')} Authenticated Identity Profile (from ID Token)
        </h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div class="p-3 bg-slate-950/80 rounded-xl border border-slate-900">
            <span class="text-slate-500 block text-[10px] mb-0.5">Display Name</span>
            <span class="text-slate-200 font-semibold truncate block">${decodedId?.payload?.name || 'N/A'}</span>
          </div>
          <div class="p-3 bg-slate-950/80 rounded-xl border border-slate-900">
            <span class="text-slate-500 block text-[10px] mb-0.5">Email / Username</span>
            <span class="text-slate-200 font-semibold truncate block">${decodedId?.payload?.preferred_username || decodedId?.payload?.email || 'N/A'}</span>
          </div>
          <div class="p-3 bg-slate-950/80 rounded-xl border border-slate-900">
            <span class="text-slate-500 block text-[10px] mb-0.5">Tenant GUID (tid)</span>
            <span class="text-slate-200 font-semibold truncate block">${decodedId?.payload?.tid || 'N/A'}</span>
          </div>
          <div class="p-3 bg-slate-950/80 rounded-xl border border-slate-900">
            <span class="text-slate-500 block text-[10px] mb-0.5">Directory Roles</span>
            <span class="text-sky-400 font-semibold truncate block">${(decodedId?.payload?.roles || ['User']).join(', ')}</span>
          </div>
        </div>
      </div>

      <!-- Main Token Inspector Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        <!-- ID Token -->
        <div class="glass-panel glass-hover p-6 rounded-2xl space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-base font-bold text-white flex items-center gap-2">
              ${icon('id-card', 'w-4 h-4 text-orange-400')} ID Token (OIDC Claims)
            </h2>
            <button data-copy="${session.id_token}" class="copy-raw-btn text-xs text-sky-400 hover:underline">Copy Raw JWT</button>
          </div>

          ${
            decodedId
              ? `
            <div class="space-y-3">
              <div>
                <span class="text-[11px] font-semibold text-slate-400 block mb-1">JOSE Header (RS256):</span>
                <pre class="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono text-purple-300 overflow-x-auto">${JSON.stringify(
                  decodedId.header,
                  null,
                  2
                )}</pre>
              </div>

              <div>
                <span class="text-[11px] font-semibold text-slate-400 block mb-1">Payload (Entra v2.0 Claims):</span>
                <pre class="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono text-emerald-300 overflow-x-auto max-h-96">${JSON.stringify(
                  decodedId.payload,
                  null,
                  2
                )}</pre>
              </div>
            </div>
          `
              : `<div class="text-xs text-slate-500">No ID Token available.</div>`
          }
        </div>

        <!-- Access Token & Session Details -->
        <div class="glass-panel glass-hover p-6 rounded-2xl space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-base font-bold text-white flex items-center gap-2">
              ${icon('key', 'w-4 h-4 text-orange-400')} Access Token &amp; Refresh Token
            </h2>
            <button data-copy="${session.access_token}" class="copy-raw-btn text-xs text-sky-400 hover:underline">Copy Access Token</button>
          </div>

          ${
            decodedAccess
              ? `
            <div class="space-y-3">
              <div>
                <span class="text-[11px] font-semibold text-slate-400 block mb-1">Access Token Claims (scp & appid):</span>
                <pre class="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono text-amber-300 overflow-x-auto">${JSON.stringify(
                  decodedAccess.payload,
                  null,
                  2
                )}</pre>
              </div>

              <div>
                <span class="text-[11px] font-semibold text-slate-400 block mb-1">Refresh Token:</span>
                <div class="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono text-slate-400 break-all select-all">
                  ${session.refresh_token || 'None issued'}
                </div>
              </div>

              <div>
                <span class="text-[11px] font-semibold text-slate-400 block mb-1">Test with cURL (Bearer Authorization):</span>
                <pre class="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono text-sky-300 overflow-x-auto">${authBearerCurl}</pre>
              </div>
            </div>
          `
              : `<div class="text-xs text-slate-500">No Access Token available.</div>`
          }
        </div>

      </div>

    </div>
  `;

  // Verification button handler
  document.getElementById('btnVerify')?.addEventListener('click', async () => {
    const alertEl = document.getElementById('verifyAlert')!;
    alertEl.className = 'p-4 rounded-xl border bg-sky-950/60 border-sky-500/40 text-sky-200 text-xs font-mono block';
    alertEl.textContent = 'Verifying ID Token signature against local JWKS...';

    try {
      const jwksUri = `${effectiveOrigin}/${tenant}/discovery/v2.0/keys`;
      const issuer = project.issuerMode === 'entra'
        ? `https://login.microsoftonline.com/${tenant}/v2.0`
        : `${effectiveOrigin}/${tenant}/v2.0`;
      const res = await verifyIDToken(session.id_token, jwksUri, issuer, project.clientId);

      if (res.verified) {
        alertEl.className = 'p-4 rounded-xl border bg-emerald-950/60 border-emerald-500/40 text-emerald-200 text-xs font-mono block';
        alertEl.innerHTML = `RS256 JWKS signature verified successfully! Key ID: sso-local-key-1, Issuer: ${res.claims?.iss || issuer}, Subject: ${res.claims?.sub}`;
        showToast('Token signature is valid!');
      } else {
        alertEl.className = 'p-4 rounded-xl border bg-rose-950/60 border-rose-500/40 text-rose-200 text-xs font-mono block';
        alertEl.textContent = `Verification Notice: ${res.reason || 'Signature could not be validated'}`;
      }
    } catch (err: any) {
      alertEl.className = 'p-4 rounded-xl border bg-rose-950/60 border-rose-500/40 text-rose-200 text-xs font-mono block';
      alertEl.textContent = `Error: ${err.message}`;
    }
  });

  // Refresh Token button handler
  document.getElementById('btnRefresh')?.addEventListener('click', async () => {
    if (!session.refresh_token) {
      showToast('No refresh_token found in session', 'error');
      return;
    }
    try {
      const tokenUrl = `${effectiveOrigin}/${tenant}/oauth2/v2.0/token`;
      const newTokens = await exchangeToken(tokenUrl, {
        grant_type: 'refresh_token',
        client_id: project.clientId,
        refresh_token: session.refresh_token,
        scope: project.scope,
      });

      saveSession({
        ...session,
        ...newTokens,
      });
      showToast('Token refreshed successfully!');
      renderLoginView(container);
    } catch (err: any) {
      showToast(`Refresh failed: ${err.message}`, 'error');
    }
  });

  // Logout button handler
  document.getElementById('btnLogout')?.addEventListener('click', () => {
    clearSession();
    showToast('Signed out of session');
    renderLoginView(container);
  });

  // Copy raw JWT handlers
  document.querySelectorAll('.copy-raw-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const raw = btn.getAttribute('data-copy') || '';
      navigator.clipboard.writeText(raw);
      showToast('Copied token to clipboard');
    });
  });
}
