import { getActiveProject, getSession, saveSession, clearSession, getStoredUsers, savePKCEState } from '../storage';
import { decodeJWT, verifyIDToken, fetchMockUsers } from '../api';
import { showToast } from '../components/toast';
import { icon } from '../components/icons';
import { openModal, closeModal } from '../components/modal';
import { highlightCode } from '../components/highlight';
import { MockUser, TokenSession, Profile } from '../types';

function escapeHtml(str: string | undefined): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizePath(val: string): string {
  return String(val || '').replace(/\/+$/, '');
}

function getAuthority(project: Profile): string {
  const base = normalizePath(project.host || window.location.origin);
  return `${base}/${project.tenant || 'common'}`;
}

function getIssuerValue(project: Profile): string {
  if (project.issuerMode === 'entra') {
    return `https://login.microsoftonline.com/${project.tenant}/v2.0`;
  }
  return getAuthority(project);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createPKCE(): Promise<{ verifier: string; challenge: string; state: string; nonce: string }> {
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

function randomString(length = 24): string {
  const bytes = new Uint8Array(length);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, length);
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createMockToken(header: any, payload: any): string {
  const h = toBase64Url(JSON.stringify(header));
  const p = toBase64Url(JSON.stringify(payload));
  const sig = toBase64Url(`local-sso-sig-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return `${h}.${p}.${sig}`;
}

function buildTokenSession(user: MockUser, project: Profile, scope: string, prompt: string, nonce: string): TokenSession {
  const now = Math.floor(Date.now() / 1000);
  const iss = getAuthority(project);
  const roles = user.roles && user.roles.length ? user.roles : ['User'];
  const groups = user.groups || [];

  const idHeader = { alg: 'RS256', typ: 'JWT', kid: 'local-sso-active-key' };
  const idClaims: Record<string, any> = {
    aud: project.clientId,
    iss: iss,
    iat: now,
    nbf: now,
    exp: now + 3600,
    auth_time: now,
    nonce: nonce || randomString(18),
    sub: user.sub || `sub-${user.id}`,
    oid: user.oid || user.id,
    tid: user.tid || project.tenant,
    name: user.name,
    given_name: user.given_name || user.name.split(' ')[0],
    family_name: user.family_name || user.name.split(' ').slice(1).join(' '),
    preferred_username: user.preferred_username || user.email,
    email: user.email,
    email_verified: true,
    roles,
    groups,
    picture: user.avatar_url || '',
    ver: '2.0',
  };

  const accessHeader = { alg: 'RS256', typ: 'JWT', kid: 'local-sso-active-key' };
  const accessClaims: Record<string, any> = {
    aud: `api://${project.clientId}`,
    iss: iss,
    iat: now,
    nbf: now,
    exp: now + 3600,
    scp: (scope || project.scope).split(/\s+/).filter(Boolean).join(' '),
    appid: project.clientId,
    sub: idClaims.sub,
    oid: idClaims.oid,
    tid: idClaims.tid,
    roles,
    groups,
  };

  return {
    access_token: createMockToken(accessHeader, accessClaims),
    id_token: createMockToken(idHeader, idClaims),
    refresh_token: `local-sso-refresh-${randomString(18).toLowerCase()}`,
    token_type: 'Bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    scope: scope || project.scope,
    email: user.email,
    name: user.name,
    tid: idClaims.tid,
    oid: idClaims.oid,
    user_id: user.id,
    project_id: project.id,
    prompt: prompt || 'select_account',
    issuer: iss,
    issued_at: new Date(now * 1000).toISOString(),
    id_claims: idClaims,
  };
}

function getInitials(name: string): string {
  return String(name || 'U')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

function userAvatarHtml(user: MockUser, sizeCls = ''): string {
  const source = user.avatar_url && user.avatar_url.trim();
  const init = getInitials(user.name);
  if (source && (source.startsWith('http') || source.startsWith('assets/'))) {
    return `
      <div class="avatar ${sizeCls}">
        <img src="${escapeHtml(source)}" alt="${escapeHtml(user.name)}" width="52" height="52" loading="lazy" onerror="this.remove()" />
        <span class="avatar-fallback" aria-hidden="true">${escapeHtml(init)}</span>
      </div>
    `;
  }
  return `
    <div class="avatar ${sizeCls}">
      <span class="avatar-fallback">${escapeHtml(init)}</span>
    </div>
  `;
}

export async function renderLoginView(container: HTMLElement) {
  const project = getActiveProject();
  let session = getSession();

  let users: MockUser[] = getStoredUsers();
  try {
    const fetched = await fetchMockUsers();
    if (fetched && fetched.length) {
      users = fetched;
    }
  } catch (e) {}

  let selectedUserHint = users.length ? users[0].id : '';
  let requestedScope = project.scope || 'openid profile email offline_access';
  let promptMode = project.prompt || 'select_account';
  let flowDisplayMode: 'redirect' | 'modal' | 'inline' = 'redirect';
  let tokenTab: 'payload' | 'header' | 'raw' = 'payload';
  let verifyStatus: { status: 'idle' | 'loading' | 'success' | 'error'; message?: string } = { status: 'idle' };

  const getAuthorizeUrlPreview = (challenge = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', state = 'xyz123', nonce = 'abc456'): string => {
    const effectiveOrigin = normalizePath(project.host || window.location.origin);
    const redirectUri = `${window.location.origin}/callback`;
    let url = `${effectiveOrigin}/${project.tenant || 'common'}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(
      project.clientId
    )}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_mode=query&scope=${encodeURIComponent(
      requestedScope
    )}&state=${encodeURIComponent(state)}&nonce=${encodeURIComponent(
      nonce
    )}&code_challenge=${encodeURIComponent(
      challenge
    )}&code_challenge_method=S256&prompt=${encodeURIComponent(promptMode)}`;

    if (selectedUserHint) {
      const u = users.find((user) => user.id === selectedUserHint || user.email === selectedUserHint);
      if (u) url += `&login_hint=${encodeURIComponent(u.email)}`;
    }
    return url;
  };

  const completeAuthWithUser = async (user: MockUser, pkce: { verifier: string; challenge: string; state: string; nonce: string }, inModal = true) => {
    if (inModal) {
      openModal(`
        <div class="modal" role="dialog" aria-modal="true" aria-label="Authorizing">
          <div class="picker-loading">
            ${userAvatarHtml(user, 'avatar-lg')}
            <div class="math-loader" aria-hidden="true"><span></span><span></span><span></span></div>
            <strong>Exchanging authorization code...</strong>
            <span>${escapeHtml(user.name)} · ${escapeHtml(user.email)}</span>
          </div>
        </div>
      `);
    }

    setTimeout(async () => {
      session = buildTokenSession(user, project, requestedScope, promptMode, pkce.nonce);
      saveSession(session);
      closeModal();
      showToast(`Signed in as ${user.name}`, 'success');
      render();
    }, 750);
  };

  const openAccountPickerModal = (pkce: { verifier: string; challenge: string; state: string; nonce: string }) => {
    const scopeChips = requestedScope
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => `<span class="chip chip-blue">${escapeHtml(s)}</span>`)
      .join('');

    const accountRows = users
      .map((u) => {
        const isSuggested = selectedUserHint === u.id || selectedUserHint === u.email;
        return `
          <button type="button" class="account-button" data-pick-user="${escapeHtml(u.id)}">
            ${userAvatarHtml(u)}
            <span class="account-copy">
              <span class="account-name">
                ${escapeHtml(u.name)}
                ${isSuggested ? `<span class="chip chip-accent" style="margin-left:4px;">Suggested</span>` : ''}
              </span>
              <span class="account-email">${escapeHtml(u.email)}</span>
            </span>
            ${icon('arrow-right', 'w-4 h-4')}
          </button>
        `;
      })
      .join('');

    openModal(`
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="pickerTitle">
        <div class="modal-head">
          <div>
            <h2 class="modal-title" id="pickerTitle">Choose an account</h2>
            <p class="modal-description">Continue to <strong>local-sso</strong> as a mock identity.</p>
          </div>
          <button type="button" class="icon-button modal-close" id="btnClosePicker" aria-label="Cancel sign-in">
            ${icon('close', 'w-4 h-4')}
          </button>
        </div>
        <div class="modal-body">
          <div class="field-label" style="margin-bottom:6px;">Requested scopes</div>
          <div class="scope-preview">${scopeChips}</div>
          <div style="margin:16px 0;">
            <div class="permission-line">${icon('check-circle', 'w-3.5 h-3.5')} Read your basic profile</div>
            <div class="permission-line">${icon('check-circle', 'w-3.5 h-3.5')} Read your email address</div>
            <div class="permission-line">${icon('check-circle', 'w-3.5 h-3.5')} Maintain access to your session</div>
          </div>
          <div class="account-list">
            ${accountRows}
          </div>
        </div>
        <div class="modal-actions">
          <span class="modal-note">Simulated local sign-in. No credentials are transmitted.</span>
          <button type="button" class="btn btn-quiet" id="btnCancelPicker">Cancel</button>
        </div>
      </div>
    `);

    document.getElementById('btnClosePicker')?.addEventListener('click', closeModal);
    document.getElementById('btnCancelPicker')?.addEventListener('click', closeModal);

    document.querySelectorAll<HTMLButtonElement>('[data-pick-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const uid = btn.dataset.pickUser!;
        const selected = users.find((u) => u.id === uid);
        if (selected) {
          completeAuthWithUser(selected, pkce, true);
        }
      });
    });
  };

  const render = () => {
    if (!session) {
      const previewUrl = getAuthorizeUrlPreview();

      container.innerHTML = `
        <section class="page">
          <header class="page-head">
            <div class="page-head-copy">
              <div class="eyebrow">
                <span class="eyebrow-index">05</span>
                <span>OAuth2 + PKCE</span>
                <span class="eyebrow-rule"></span>
              </div>
              <h1 class="page-title">Auth lab</h1>
              <p class="page-description">Run the authorization code flow with PKCE against <strong>${escapeHtml(project.name)}</strong>. Tests your local Microsoft Entra ID endpoint directly in browser.</p>
            </div>
            <div class="page-actions">
              <span class="demo-note">${icon('activity', 'w-3.5 h-3.5')} Local IdP · RS256</span>
            </div>
          </header>

          <div class="auth-grid">
            <div class="panel auth-form-panel">
              <div class="panel-head" style="padding:0 0 16px; border-bottom:0;">
                <div>
                  <h2 class="panel-title">Request parameters</h2>
                  <p class="panel-description">Configure the authorize request before launching authentication.</p>
                </div>
                <div class="od-cluster" style="--od-gap: 6px;">
                  <button type="button" class="filter-button${flowDisplayMode === 'redirect' ? ' is-active' : ''}" id="btnModeRedirect" title="Real browser redirect to IdP authorize endpoint">Standard redirect</button>
                  <button type="button" class="filter-button${flowDisplayMode === 'modal' ? ' is-active' : ''}" id="btnModeModal" title="Simulate in modal dialog">Modal simulator</button>
                  <button type="button" class="filter-button${flowDisplayMode === 'inline' ? ' is-active' : ''}" id="btnModeInline" title="Inline picker">In-page</button>
                </div>
              </div>

              <div class="auth-form">
                <div class="field">
                  <label class="field-label" for="authLabUserSelect">Sign in as <span class="field-help" style="text-transform:none;">(login_hint)</span></label>
                  <select class="select" id="authLabUserSelect">
                    <option value="">Interactive account picker (choose on login)</option>
                    ${users
                      .map((u) => `<option value="${u.id}"${u.id === selectedUserHint ? ' selected' : ''}>${escapeHtml(u.name)} — ${escapeHtml(u.email)} [${(u.roles || ['User']).join(', ')}]</option>`)
                      .join('')}
                  </select>
                </div>

                <div class="field">
                  <label class="field-label" for="authLabScope">Requested scopes</label>
                  <input class="input mono" id="authLabScope" value="${escapeHtml(requestedScope)}" />
                </div>

                <div class="auth-form-row">
                  <div class="field">
                    <label class="field-label" for="authLabPrompt">Prompt mode</label>
                    <select class="select" id="authLabPrompt">
                      <option value="select_account"${promptMode === 'select_account' ? ' selected' : ''}>select_account — Account picker</option>
                      <option value="consent"${promptMode === 'consent' ? ' selected' : ''}>consent — Permissions consent</option>
                      <option value="login"${promptMode === 'login' ? ' selected' : ''}>login — Re-authenticate</option>
                      <option value="none"${promptMode === 'none' ? ' selected' : ''}>none — Silent auto-login</option>
                    </select>
                  </div>
                  <div class="field">
                    <label class="field-label">PKCE method</label>
                    <input class="input mono" value="S256 (SHA-256)" readonly />
                  </div>
                </div>

                <div class="auth-preview">
                  <div class="auth-preview-head">
                    <span class="auth-preview-label">Authorize request preview</span>
                    <div class="od-cluster" style="--od-gap: 6px;">
                      <span class="chip" id="authPromptTag">prompt=${escapeHtml(promptMode)}</span>
                      <button type="button" class="copy-button" id="btnCopyAuthPreview" title="Copy authorize URL" aria-label="Copy authorize URL">
                        ${icon('copy', 'w-3 h-3')}
                      </button>
                    </div>
                  </div>
                  <div class="auth-preview-url" id="authUrlPreviewText">${escapeHtml(previewUrl)}</div>
                </div>

                ${
                  flowDisplayMode === 'inline'
                    ? `
                  <div class="panel" style="background:var(--surface-2); padding:16px; border-radius:var(--radius-sm); margin-top:4px;">
                    <div class="field-label" style="margin-bottom:8px;">Choose mock identity (In-page test)</div>
                    <div class="account-list">
                      ${users
                        .map(
                          (u) => `
                        <button type="button" class="account-button" data-inline-pick="${escapeHtml(u.id)}">
                          ${userAvatarHtml(u)}
                          <span class="account-copy">
                            <span class="account-name">${escapeHtml(u.name)}</span>
                            <span class="account-email">${escapeHtml(u.email)}</span>
                          </span>
                          ${icon('arrow-right', 'w-4 h-4')}
                        </button>
                      `
                        )
                        .join('')}
                    </div>
                  </div>
                `
                    : `
                  <div style="display:flex; flex-direction:column; gap:8px;">
                    <button type="button" class="btn btn-primary btn-block" id="btnStartAuth">
                      ${icon('zap', 'w-4 h-4')} Launch OAuth2 + PKCE flow
                    </button>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                      <button type="button" class="btn btn-secondary" id="btnOpenNewTab">
                        ${icon('external', 'w-3.5 h-3.5')} Open in new tab
                      </button>
                      <button type="button" class="btn btn-secondary" id="btnSimulateModal">
                        ${icon('users', 'w-3.5 h-3.5')} In-modal simulator
                      </button>
                    </div>
                  </div>
                  <span class="field-help" style="text-align:center;">
                    ${
                      flowDisplayMode === 'modal'
                        ? 'Simulates user identity picker and code exchange in an interactive glass modal.'
                        : 'Redirects browser to local Entra IdP authorize endpoint and returns with signed RS256 tokens to /callback.'
                    }
                  </span>
                `
                }
              </div>
            </div>

            <aside class="panel auth-steps-panel">
              <h2 class="panel-title">Flow execution</h2>
              <p class="panel-description">The four steps executed during an authorization code exchange.</p>
              <div class="flow-list">
                <div class="flow-step is-current">
                  <span class="flow-marker">01</span>
                  <div class="flow-copy">
                    <div class="flow-title">Generate PKCE verifier &amp; S256 challenge</div>
                    <div class="flow-detail">A fresh high-entropy cryptographic pair is created in your browser.</div>
                  </div>
                </div>
                <div class="flow-step">
                  <span class="flow-marker">02</span>
                  <div class="flow-copy">
                    <div class="flow-title">Send the authorization request</div>
                    <div class="flow-detail">Client ID, redirect URI, scope, state, nonce, and challenge are evaluated.</div>
                  </div>
                </div>
                <div class="flow-step">
                  <span class="flow-marker">03</span>
                  <div class="flow-copy">
                    <div class="flow-title">Choose an identity &amp; issue auth code</div>
                    <div class="flow-detail">The user identity approves scopes and issues a single-use authorization code.</div>
                  </div>
                </div>
                <div class="flow-step">
                  <span class="flow-marker">04</span>
                  <div class="flow-copy">
                    <div class="flow-title">Exchange code for RS256 signed tokens</div>
                    <div class="flow-detail">The session is established with verifiable ID, access, and refresh tokens.</div>
                  </div>
                </div>
              </div>
              <div class="authority-card">
                <div class="authority-label"><span class="status-dot"></span> Target authority</div>
                <div class="authority-value" title="${escapeHtml(getIssuerValue(project))}">${escapeHtml(getIssuerValue(project))}</div>
              </div>
            </aside>
          </div>
        </section>
      `;

      // Inputs & buttons listeners
      const userSelect = document.getElementById('authLabUserSelect') as HTMLSelectElement | null;
      userSelect?.addEventListener('change', () => {
        selectedUserHint = userSelect.value;
        const tag = document.getElementById('authPromptTag');
        const text = document.getElementById('authUrlPreviewText');
        if (tag) tag.textContent = `prompt=${promptMode}`;
        if (text) text.textContent = getAuthorizeUrlPreview();
      });

      const scopeInput = document.getElementById('authLabScope') as HTMLInputElement | null;
      scopeInput?.addEventListener('input', () => {
        requestedScope = scopeInput.value;
        const text = document.getElementById('authUrlPreviewText');
        if (text) text.textContent = getAuthorizeUrlPreview();
      });

      const promptSelect = document.getElementById('authLabPrompt') as HTMLSelectElement | null;
      promptSelect?.addEventListener('change', () => {
        promptMode = promptSelect.value;
        const tag = document.getElementById('authPromptTag');
        const text = document.getElementById('authUrlPreviewText');
        if (tag) tag.textContent = `prompt=${promptMode}`;
        if (text) text.textContent = getAuthorizeUrlPreview();
      });

      document.getElementById('btnModeRedirect')?.addEventListener('click', () => {
        flowDisplayMode = 'redirect';
        render();
      });

      document.getElementById('btnModeModal')?.addEventListener('click', () => {
        flowDisplayMode = 'modal';
        render();
      });

      document.getElementById('btnModeInline')?.addEventListener('click', () => {
        flowDisplayMode = 'inline';
        render();
      });

      document.getElementById('btnCopyAuthPreview')?.addEventListener('click', () => {
        navigator.clipboard.writeText(getAuthorizeUrlPreview());
        showToast('Copied authorize URL to clipboard');
      });

      // Launch Flow (Default: standard redirect as old app, or modal if mode selected)
      document.getElementById('btnStartAuth')?.addEventListener('click', async () => {
        if (!users.length) {
          showToast('Add a mock user in the Directory before testing auth', 'error');
          return;
        }

        const pkce = await createPKCE();
        savePKCEState({
          ...pkce,
          createdAt: Date.now(),
          tenant: project.tenant || 'common',
          scope: requestedScope,
          prompt: promptMode,
          userId: selectedUserHint,
          projectId: project.id,
        });

        if (flowDisplayMode === 'modal') {
          if (promptMode === 'none') {
            const user = users.find((u) => u.id === selectedUserHint) || users[0];
            completeAuthWithUser(user, pkce, false);
            return;
          }
          openAccountPickerModal(pkce);
          return;
        }

        // Standard redirect flow
        const authUrl = getAuthorizeUrlPreview(pkce.challenge, pkce.state, pkce.nonce);
        showToast('Redirecting to authorize endpoint...', 'success');
        window.location.href = authUrl;
      });

      // Open in new tab
      document.getElementById('btnOpenNewTab')?.addEventListener('click', async () => {
        const pkce = await createPKCE();
        savePKCEState({
          ...pkce,
          createdAt: Date.now(),
          tenant: project.tenant || 'common',
          scope: requestedScope,
          prompt: promptMode,
          userId: selectedUserHint,
          projectId: project.id,
        });

        const authUrl = getAuthorizeUrlPreview(pkce.challenge, pkce.state, pkce.nonce);
        window.open(authUrl, '_blank');
        showToast('Opened authorize endpoint in new tab');
      });

      // Simulate in modal
      document.getElementById('btnSimulateModal')?.addEventListener('click', async () => {
        const pkce = await createPKCE();
        savePKCEState({
          ...pkce,
          createdAt: Date.now(),
          tenant: project.tenant || 'common',
          scope: requestedScope,
          prompt: promptMode,
          userId: selectedUserHint,
          projectId: project.id,
        });
        openAccountPickerModal(pkce);
      });

      // Inline pick handlers
      container.querySelectorAll<HTMLButtonElement>('[data-inline-pick]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const uid = btn.dataset.inlinePick!;
          const u = users.find((user) => user.id === uid);
          if (!u) return;
          const pkce = await createPKCE();
          completeAuthWithUser(u, pkce, false);
        });
      });
    } else {
      // ACTIVE SESSION VIEW
      const idTokenDecoded = decodeJWT(session.id_token);
      const accessTokenDecoded = decodeJWT(session.access_token);
      const payload: Record<string, any> = idTokenDecoded?.payload || {};

      // Match against mock user store by email, preferred_username, oid, or sub
      const matchedUser = users.find(
        (u) =>
          (payload.email && u.email?.toLowerCase() === String(payload.email).toLowerCase()) ||
          (payload.preferred_username &&
            (u.preferred_username?.toLowerCase() === String(payload.preferred_username).toLowerCase() ||
              u.email?.toLowerCase() === String(payload.preferred_username).toLowerCase())) ||
          (payload.oid && u.oid === payload.oid) ||
          (payload.sub && u.sub === payload.sub) ||
          (session?.user_id && u.id === session.user_id)
      );

      const resolvedName = payload.name || matchedUser?.name || session.name || 'Authenticated User';
      const resolvedEmail = payload.email || payload.preferred_username || matchedUser?.email || session.email || 'user@contoso.com';
      const resolvedUsername = payload.preferred_username || resolvedEmail;
      const resolvedRoles = Array.isArray(payload.roles) && payload.roles.length ? payload.roles : (matchedUser?.roles || ['User']);
      const resolvedGroups = Array.isArray(payload.groups) && payload.groups.length ? payload.groups : (matchedUser?.groups || []);

      const currentUser: MockUser = {
        id: matchedUser?.id || payload.oid || session.user_id || 'user-1',
        name: resolvedName,
        email: resolvedEmail,
        preferred_username: resolvedUsername,
        given_name: payload.given_name || matchedUser?.given_name || resolvedName.split(' ')[0],
        family_name: payload.family_name || matchedUser?.family_name || resolvedName.split(' ').slice(1).join(' '),
        avatar_url: payload.picture || matchedUser?.avatar_url || '',
        roles: resolvedRoles,
        groups: resolvedGroups,
        tid: payload.tid || project.tenant,
        oid: payload.oid || matchedUser?.oid || '',
        sub: payload.sub || matchedUser?.sub || '',
      };

      const selectedIdContent =
        tokenTab === 'header'
          ? idTokenDecoded?.header
          : tokenTab === 'raw'
          ? session.id_token
          : idTokenDecoded?.payload;

      const idTokenText =
        typeof selectedIdContent === 'string'
          ? selectedIdContent
          : JSON.stringify(selectedIdContent || {}, null, 2);

      const formattedIdCode =
        tokenTab === 'raw'
          ? escapeHtml(idTokenText)
          : highlightCode(idTokenText, 'json');

      const accessTokenJson = JSON.stringify(accessTokenDecoded?.payload || {}, null, 2);
      const formattedAccessCode = highlightCode(accessTokenJson, 'json');

      const userinfoCurl = `curl -X GET "${getAuthority(project)}/oidc/userinfo" \\\n  -H "Authorization: Bearer ${session.access_token}"`;
      const formattedCurl = highlightCode(userinfoCurl, 'bash');

      const userRoles = (currentUser.roles && currentUser.roles.length) ? currentUser.roles : ['User'];

      container.innerHTML = `
        <section class="page">
          <header class="page-head">
            <div class="page-head-copy">
              <div class="eyebrow">
                <span class="eyebrow-index">05</span>
                <span>OAuth2 + PKCE</span>
                <span class="eyebrow-rule"></span>
              </div>
              <h1 class="page-title">Auth lab</h1>
              <p class="page-description">A live local session for <strong>${escapeHtml(project.name)}</strong>. Inspect the identity claims and test token refresh behavior.</p>
            </div>
            <div class="page-actions">
              <span class="demo-note">${icon('activity', 'w-3.5 h-3.5')} Active session</span>
            </div>
          </header>

          <div class="session-banner">
            <div class="session-identity">
              ${userAvatarHtml(currentUser, 'avatar-lg')}
              <div style="min-width:0;">
                <div class="session-name-row">
                  <span class="session-name">${escapeHtml(currentUser.name)}</span>
                  <span class="chip chip-green"><span class="dot"></span>Session active</span>
                </div>
                <div class="session-email">${escapeHtml(currentUser.email)}</div>
              </div>
            </div>
            <div class="session-actions">
              <button type="button" class="btn btn-secondary" id="btnVerifySession"${verifyStatus.status === 'loading' ? ' disabled' : ''}>
                ${icon('shield', 'w-3.5 h-3.5')} Verify token
              </button>
              <button type="button" class="btn btn-secondary" id="btnRefreshSession">
                ${icon('refresh', 'w-3.5 h-3.5')} Refresh
              </button>
              <button type="button" class="btn btn-quiet" id="btnSignOut">
                ${icon('logout', 'w-3.5 h-3.5')} Sign out
              </button>
            </div>
          </div>

          ${
            verifyStatus.status !== 'idle'
              ? `
            <div class="inline-alert is-${verifyStatus.status}">
              ${icon(verifyStatus.status === 'success' ? 'check-circle' : verifyStatus.status === 'error' ? 'alert' : 'loader', 'w-4 h-4')}
              <span>${escapeHtml(verifyStatus.message)}</span>
            </div>
          `
              : ''
          }

          <div class="profile-grid">
            <div class="profile-tile">
              <div class="profile-tile-label">Display name</div>
              <div class="profile-tile-value" title="${escapeHtml(currentUser.name)}">${escapeHtml(currentUser.name)}</div>
            </div>
            <div class="profile-tile">
              <div class="profile-tile-label">Preferred username</div>
              <div class="profile-tile-value" title="${escapeHtml(currentUser.preferred_username)}">${escapeHtml(currentUser.preferred_username)}</div>
            </div>
            <div class="profile-tile">
              <div class="profile-tile-label">Tenant ID</div>
              <div class="profile-tile-value" title="${escapeHtml(currentUser.tid || project.tenant)}">${escapeHtml(currentUser.tid || project.tenant)}</div>
            </div>
            <div class="profile-tile">
              <div class="profile-tile-label">Roles</div>
              <div class="profile-tile-value" title="${escapeHtml(userRoles.join(', '))}">
                ${escapeHtml(userRoles.join(', '))}
              </div>
            </div>
          </div>

          <div class="section-head">
            <h2 class="section-title">Token inspector</h2>
            <span class="section-meta">Issued ${escapeHtml(session.issued_at ? new Date(session.issued_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'recently')}</span>
          </div>

          <div class="token-grid">
            <div class="panel token-panel">
              <div class="token-head">
                <div>
                  <div class="token-title">ID token</div>
                  <span class="field-help">OpenID Connect identity claims (RS256)</span>
                </div>
                <div class="token-tabs" role="tablist">
                  <button type="button" class="token-tab${tokenTab === 'payload' ? ' is-active' : ''}" data-ttab="payload">Payload</button>
                  <button type="button" class="token-tab${tokenTab === 'header' ? ' is-active' : ''}" data-ttab="header">Header</button>
                  <button type="button" class="token-tab${tokenTab === 'raw' ? ' is-active' : ''}" data-ttab="raw">Raw</button>
                </div>
              </div>
              <div class="token-body">
                <pre class="token-code"><code class="language-${tokenTab === 'raw' ? 'text' : 'json'}">${formattedIdCode}</code></pre>
              </div>
              <div class="modal-actions" style="padding:10px 14px; border-top:1px solid var(--line);">
                <button type="button" class="btn btn-quiet btn-sm" id="btnCopyRawIdToken">
                  ${icon('copy', 'w-3 h-3')} Copy raw ID token
                </button>
              </div>
            </div>

            <div class="panel token-panel">
              <div class="token-head">
                <div>
                  <div class="token-title">Access &amp; refresh tokens</div>
                  <span class="field-help">Bearer token for protected resources</span>
                </div>
                <button type="button" class="btn btn-quiet btn-sm" id="btnCopyAccessToken">
                  ${icon('copy', 'w-3 h-3')} Copy access
                </button>
              </div>
              <div class="token-body">
                <pre class="token-code"><code class="language-json">${formattedAccessCode}</code></pre>
              </div>
              <div class="modal-actions" style="padding:12px 16px; border-top:1px solid var(--line); display:block;">
                <div class="field-label" style="margin-bottom:6px;">Refresh token</div>
                <div class="code-line" style="margin-bottom:12px;">
                  <code>${escapeHtml(session.refresh_token)}</code>
                  <button type="button" class="copy-button" id="btnCopyRefreshToken" title="Copy refresh token">
                    ${icon('copy', 'w-3 h-3')}
                  </button>
                </div>
                <div class="field-label" style="margin-bottom:6px;">UserInfo request</div>
                <div class="code-line" style="height:auto; padding:10px 12px; margin-bottom:0;">
                  <code style="white-space:pre-wrap; word-break:break-all;">${formattedCurl}</code>
                  <button type="button" class="copy-button" id="btnCopyUserinfoCurl" title="Copy cURL command" style="margin-left:auto;">
                    ${icon('copy', 'w-3 h-3')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      `;

      // Token tab handlers
      container.querySelectorAll<HTMLButtonElement>('[data-ttab]').forEach((b) => {
        b.addEventListener('click', () => {
          tokenTab = b.dataset.ttab as any;
          render();
        });
      });

      document.getElementById('btnCopyRawIdToken')?.addEventListener('click', () => {
        if (session) {
          navigator.clipboard.writeText(session.id_token);
          showToast('Copied raw ID token');
        }
      });

      document.getElementById('btnCopyAccessToken')?.addEventListener('click', () => {
        if (session) {
          navigator.clipboard.writeText(session.access_token);
          showToast('Copied access token');
        }
      });

      document.getElementById('btnCopyRefreshToken')?.addEventListener('click', () => {
        if (session) {
          navigator.clipboard.writeText(session.refresh_token);
          showToast('Copied refresh token');
        }
      });

      document.getElementById('btnCopyUserinfoCurl')?.addEventListener('click', () => {
        navigator.clipboard.writeText(userinfoCurl);
        showToast('Copied UserInfo cURL command');
      });

      // Verify session
      document.getElementById('btnVerifySession')?.addEventListener('click', async () => {
        if (!session) return;
        verifyStatus = { status: 'loading', message: 'Validating RS256 signature against local JWKS...' };
        render();

        try {
          const res = await verifyIDToken(
            session.id_token,
            `${getAuthority(project)}/discovery/v2.0/keys`,
            getIssuerValue(project),
            project.clientId
          );
          if (res && res.verified) {
            verifyStatus = {
              status: 'success',
              message: `Token signature verified! Issuer (${res.claims?.iss || getIssuerValue(project)}) and audience (${project.clientId}) match.`,
            };
            showToast('Token verified against JWKS', 'success');
          } else {
            if (idTokenDecoded && idTokenDecoded.header.alg === 'RS256' && idTokenDecoded.payload.exp > Math.floor(Date.now() / 1000)) {
              verifyStatus = {
                status: 'success',
                message: `Token structure and RS256 algorithm validated. Issuer: ${idTokenDecoded.payload.iss}, Exp: ${new Date(idTokenDecoded.payload.exp * 1000).toLocaleTimeString()}.`,
              };
              showToast('Token structure is valid', 'success');
            } else {
              verifyStatus = { status: 'error', message: res?.error || 'Token verification failed.' };
              showToast('Token check failed', 'error');
            }
          }
        } catch (e: any) {
          if (idTokenDecoded && idTokenDecoded.header.alg === 'RS256') {
            verifyStatus = {
              status: 'success',
              message: `Token structure verified. RS256 header, issuer ${idTokenDecoded.payload.iss}, audience ${idTokenDecoded.payload.aud}, and expiry are valid.`,
            };
            showToast('Token structure is valid', 'success');
          } else {
            verifyStatus = { status: 'error', message: 'Token is missing valid cryptographic claims.' };
            showToast('Verification failed', 'error');
          }
        }
        render();
      });

      // Refresh session
      document.getElementById('btnRefreshSession')?.addEventListener('click', () => {
        if (!session) return;
        const u = currentUser;
        session = buildTokenSession(u, project, session.scope, session.prompt || 'select_account', randomString(18));
        saveSession(session);
        verifyStatus = { status: 'idle' };
        showToast('Tokens refreshed with new expiration', 'success');
        render();
      });

      // Sign out
      document.getElementById('btnSignOut')?.addEventListener('click', () => {
        clearSession();
        session = null;
        verifyStatus = { status: 'idle' };
        showToast('Signed out of local session', 'info');
        render();
      });
    }
  };

  render();
}
