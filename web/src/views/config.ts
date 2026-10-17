import { getActiveProject, saveActiveProject } from '../storage';
import { icon } from '../components/icons';
import { showToast } from '../components/toast';
import { highlightCode } from '../components/highlight';
import { Profile } from '../types';

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

function getHostName(project: Profile): string {
  return normalizePath(project.host || window.location.origin).replace(/^https?:\/\//, '');
}

function getIssuerValue(project: Profile): string {
  if (project.issuerMode === 'entra') {
    return `https://login.microsoftonline.com/${project.tenant}/v2.0`;
  }
  return getAuthority(project);
}

interface EndpointItem {
  id: string;
  name: string;
  method: string;
  kind: 'standard' | 'mock';
  url: string;
  description: string;
  request: string;
  responseLabel: string;
  response: string;
}

function getEndpointsForProject(project: Profile): EndpointItem[] {
  const base = getAuthority(project);
  const host = getHostName(project);
  const authorize = `${base}/oauth2/v2.0/authorize`;
  const token = `${base}/oauth2/v2.0/token`;
  const userinfo = `${base}/oidc/userinfo`;
  const discovery = `${base}/oauth2/v2.0/.well-known/openid-configuration`;
  const jwks = `${base}/discovery/v2.0/keys`;
  const issuer = getIssuerValue(project);
  const endSession = `${base}/oauth2/v2.0/logout`;
  const clientId = project.clientId;
  const redirect = project.redirectUri;
  const scope = project.scope;
  const secret = project.clientSecret || 'local-sso-secret';
  const rootUrl = project.rootUrl || 'http://localhost:3000';
  const rawOrigin = normalizePath(project.host || window.location.origin);

  return [
    {
      id: 'authorize',
      name: 'OIDC Authorize Endpoint',
      method: 'GET',
      kind: 'standard',
      url: authorize,
      description: 'Initiates the OAuth2 / OIDC sign-in flow and returns an authorization code protected by PKCE.',
      request: `GET /${project.tenant}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(scope)}&response_mode=query&state=xyz123&code_challenge=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk&code_challenge_method=S256&prompt=select_account HTTP/1.1\nHost: ${host}`,
      responseLabel: '302 redirect',
      response: `HTTP/1.1 302 Found\nLocation: ${redirect}?code=mock_code_8f2b1d9c&state=xyz123`,
    },
    {
      id: 'token',
      name: 'OAuth2 Token Endpoint',
      method: 'POST',
      kind: 'standard',
      url: token,
      description: 'Redeems an authorization code and PKCE verifier, or a refresh token, for RS256 ID and access tokens.',
      request: `POST /${project.tenant}/oauth2/v2.0/token HTTP/1.1\nHost: ${host}\nContent-Type: application/x-www-form-urlencoded\n\ngrant_type=authorization_code&client_id=${clientId}&client_secret=${secret}&code=mock_code_8f2b1d9c&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk&redirect_uri=${encodeURIComponent(redirect)}`,
      responseLabel: '200 OK',
      response: JSON.stringify(
        {
          token_type: 'Bearer',
          scope,
          expires_in: 3600,
          access_token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImxvY2FsLXNzby1rZXki... (RS256 JWT)',
          id_token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImxvY2FsLXNzby1rZXki... (RS256 JWT)',
          refresh_token: 'local-sso-refresh-8f2b1d9c4e0a7',
        },
        null,
        2
      ),
    },
    {
      id: 'userinfo',
      name: 'OIDC UserInfo Endpoint',
      method: 'GET',
      kind: 'mock',
      url: userinfo,
      description: 'A local helper for generic OIDC clients expecting standard UserInfo JSON. Microsoft Entra ID usually serves this via Microsoft Graph.',
      request: `GET /${project.tenant}/oidc/userinfo HTTP/1.1\nHost: ${host}\nAuthorization: Bearer <access_token>`,
      responseLabel: '200 OK',
      response: JSON.stringify(
        {
          sub: 'sub-sazzad-sazib-001',
          name: 'Sazzad Sazib',
          preferred_username: 'sazib@gmail.com',
          email: 'sazib@gmail.com',
          email_verified: true,
          tid: project.tenant,
          roles: ['Global Administrator', 'User'],
          groups: ['Engineers', 'Admins'],
        },
        null,
        2
      ),
    },
    {
      id: 'proxy',
      name: 'Browser CORS Token Proxy',
      method: 'POST',
      kind: 'mock',
      url: `${rawOrigin}/api/token`,
      description: 'A CORS-friendly JSON exchange for browser SPAs and test scripts unable to call form-encoded endpoints directly.',
      request: `POST /api/token HTTP/1.1\nHost: ${host}\nContent-Type: application/json\n\n${JSON.stringify({ token_url: token, client_id: clientId, client_secret: secret, code: 'mock_code_8f2b1d9c', code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', redirect_uri: redirect }, null, 2)}`,
      responseLabel: '200 OK',
      response: JSON.stringify({ access_token: 'eyJhbGci...', id_token: 'eyJhbGci...', token_type: 'Bearer', expires_in: 3600 }, null, 2),
    },
    {
      id: 'verify',
      name: 'Token Signature & Claims Validator',
      method: 'POST',
      kind: 'mock',
      url: `${rawOrigin}/api/verify`,
      description: 'Validates RS256 signatures against the local JWKS and returns decoded claims for test automation.',
      request: `POST /api/verify HTTP/1.1\nHost: ${host}\nContent-Type: application/json\n\n${JSON.stringify({ id_token: 'eyJhbGci...', jwks_uri: jwks, issuer, audience: clientId }, null, 2)}`,
      responseLabel: '200 OK',
      response: JSON.stringify({ verified: true, claims: { sub: 'sub-sazzad-sazib-001', name: 'Sazzad Sazib', email: 'sazib@gmail.com', roles: ['Global Administrator', 'User'] } }, null, 2),
    },
    {
      id: 'discovery',
      name: 'OpenID Discovery Document',
      method: 'GET',
      kind: 'standard',
      url: discovery,
      description: 'Auto-discovery configuration consumed by OIDC libraries (NextAuth, Better Auth, MSAL, jose, Spring Security).',
      request: `GET /${project.tenant}/oauth2/v2.0/.well-known/openid-configuration HTTP/1.1\nHost: ${host}\nAccept: application/json`,
      responseLabel: '200 OK',
      response: JSON.stringify(
        {
          issuer,
          authorization_endpoint: authorize,
          token_endpoint: token,
          userinfo_endpoint: userinfo,
          jwks_uri: jwks,
          end_session_endpoint: endSession,
          response_types_supported: ['code', 'id_token', 'code id_token', 'token'],
          scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256', 'plain'],
        },
        null,
        2
      ),
    },
    {
      id: 'jwks',
      name: 'JWKS Public Keys',
      method: 'GET',
      kind: 'standard',
      url: jwks,
      description: 'The JSON Web Key Set with RSA public keys used by resource servers to verify token signatures.',
      request: `GET /${project.tenant}/discovery/v2.0/keys HTTP/1.1\nHost: ${host}\nAccept: application/json`,
      responseLabel: '200 OK',
      response: JSON.stringify({ keys: [{ kty: 'RSA', use: 'sig', alg: 'RS256', kid: 'local-sso-active-key', n: 'u9h3K8x2Y_... (2048-bit RSA modulus)', e: 'AQAB' }] }, null, 2),
    },
    {
      id: 'issuer',
      name: 'OIDC Token Issuer',
      method: 'CONFIG',
      kind: 'standard',
      url: issuer,
      description: 'The expected issuer URI matched against the iss claim inside signed ID tokens.',
      request: `// Decoded ID token payload claim:\n{\n  "iss": "${issuer}",\n  "aud": "${clientId}",\n  "sub": "sub-sazzad-sazib-001",\n  "tid": "${project.tenant}"\n}`,
      responseLabel: 'JWT claim match',
      response: `iss == "${issuer}"\naud == "${clientId}"\nSignature: validated via local JWKS`,
    },
    {
      id: 'logout',
      name: 'End Session / Logout',
      method: 'GET',
      kind: 'standard',
      url: endSession,
      description: 'Terminates the single sign-on session and redirects back to post_logout_redirect_uri.',
      request: `GET /${project.tenant}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(rootUrl)} HTTP/1.1\nHost: ${host}`,
      responseLabel: '302 redirect',
      response: `HTTP/1.1 302 Found\nLocation: ${rootUrl}`,
    },
  ];
}

export function renderConfigView(container: HTMLElement, onProjectChange?: () => void) {
  const project = getActiveProject();
  let activeTab: 'settings' | 'endpoints' = 'settings';
  let endpointFilter: 'all' | 'standard' | 'mock' = 'all';
  let endpointQuery = '';

  const render = () => {
    const endpoints = getEndpointsForProject(project);
    const authorizeUrl = `${getAuthority(project)}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(
      project.clientId
    )}&response_type=code&redirect_uri=${encodeURIComponent(
      project.redirectUri
    )}&scope=${encodeURIComponent(project.scope)}&prompt=select_account`;

    container.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div class="page-head-copy">
            <div class="eyebrow">
              <span class="eyebrow-index">02</span>
              <span>Project configuration</span>
              <span class="eyebrow-rule"></span>
            </div>
            <h1 class="page-title">Endpoints &amp; config</h1>
            <p class="page-description">Tune the identity provider parameters for <strong>${escapeHtml(project.name)}</strong>, then copy the exact endpoints into your application.</p>
          </div>
          <div class="page-actions">
            <a class="btn btn-secondary" href="#login">
              ${icon('terminal', 'w-4 h-4')} Open auth lab
            </a>
          </div>
        </header>

        <div class="config-layout">
          <div class="config-main">
            <div class="tabs" role="tablist" aria-label="Configuration sections">
              <button type="button" class="tab${activeTab === 'settings' ? ' is-active' : ''}" id="tabBtnSettings" role="tab" aria-selected="${activeTab === 'settings'}">
                Project settings
              </button>
              <button type="button" class="tab${activeTab === 'endpoints' ? ' is-active' : ''}" id="tabBtnEndpoints" role="tab" aria-selected="${activeTab === 'endpoints'}">
                Endpoints &amp; APIs <span class="tab-count">${endpoints.length}</span>
              </button>
            </div>

            ${
              activeTab === 'settings'
                ? `
              <div class="panel">
                <div class="panel-head">
                  <div>
                    <h2 class="panel-title">Project settings</h2>
                    <p class="panel-description">These values shape the issuer, discovery document, and token claims returned to your client.</p>
                  </div>
                  <span class="chip chip-accent">Entra ID</span>
                </div>
                <div class="panel-body">
                  <form id="settingsForm" novalidate>
                    <div class="form-grid">
                      <div class="field field-full">
                        <label class="field-label" for="settingName">Project name <span class="required">*</span></label>
                        <input class="input" id="settingName" value="${escapeHtml(project.name)}" required />
                      </div>
                      <div class="field">
                        <label class="field-label" for="settingRoot">Root URL <span class="required">*</span></label>
                        <input class="input mono" id="settingRoot" value="${escapeHtml(project.rootUrl)}" placeholder="http://localhost:3000" inputmode="url" required />
                        <span class="field-help">Used by end-session redirect and example snippets.</span>
                      </div>
                      <div class="field">
                        <label class="field-label" for="settingRedirect">Redirect URI <span class="required">*</span></label>
                        <input class="input mono" id="settingRedirect" value="${escapeHtml(project.redirectUri)}" placeholder="http://localhost:3000/callback" inputmode="url" required />
                      </div>
                      <div class="field">
                        <label class="field-label" for="settingTenant">Tenant <span class="required">*</span></label>
                        <input class="input mono" id="settingTenant" value="${escapeHtml(project.tenant)}" required />
                        <span class="field-help">Use <code>common</code> or a tenant GUID.</span>
                      </div>
                      <div class="field">
                        <label class="field-label" for="settingClientId">Client ID <span class="required">*</span></label>
                        <input class="input mono" id="settingClientId" value="${escapeHtml(project.clientId)}" required />
                      </div>
                      <div class="field">
                        <label class="field-label" for="settingSecret">Client secret</label>
                        <div class="input-wrap">
                          <input class="input mono" id="settingSecret" value="${escapeHtml(project.clientSecret || '')}" readonly />
                          <button type="button" class="input-action" id="btnCopySecret" title="Copy client secret" aria-label="Copy client secret">
                            ${icon('copy', 'w-3.5 h-3.5')}
                          </button>
                        </div>
                        <span class="field-help">Mock secrets are accepted universally by this provider.</span>
                      </div>
                      <div class="field">
                        <label class="field-label" for="settingIssuer">Issuer mode</label>
                        <select class="select" id="settingIssuer">
                          <option value="host"${project.issuerMode !== 'entra' ? ' selected' : ''}>Host-based issuer (${escapeHtml(getAuthority(project))})</option>
                          <option value="entra"${project.issuerMode === 'entra' ? ' selected' : ''}>Microsoft Entra issuer (https://login.microsoftonline.com/...)</option>
                        </select>
                        <span class="field-help">Controls the <code>iss</code> claim in tokens.</span>
                      </div>
                      <div class="field field-full">
                        <label class="field-label" for="settingScope">Requested scopes <span class="required">*</span></label>
                        <input class="input mono" id="settingScope" value="${escapeHtml(project.scope)}" required />
                        <span class="field-help">Space-separated. Keep <code>openid</code> for OIDC flows.</span>
                      </div>
                      <div class="field field-full">
                        <label class="field-label" for="settingHost">Authority host override</label>
                        <input class="input mono" id="settingHost" value="${escapeHtml(project.host || '')}" placeholder="Leave blank to use current origin (${escapeHtml(window.location.origin)})" />
                        <span class="field-help">Optional override for reverse proxies, tunnels, or mobile testing.</span>
                      </div>
                    </div>
                    <div class="form-actions">
                      <span class="form-note">Changes are saved in this browser.</span>
                      <button type="button" class="btn btn-quiet" id="btnResetSettings">Reset</button>
                      <button type="submit" class="btn btn-primary">${icon('check', 'w-3.5 h-3.5')} Save changes</button>
                    </div>
                  </form>

                  <div class="authorize-block">
                    <div class="authorize-head">
                      <div>
                        <div class="authorize-title">Authorize URL</div>
                        <span class="field-help">Direct browser entry point for testing single sign-on.</span>
                      </div>
                      <button type="button" class="copy-button" id="btnCopyAuthUrl" title="Copy authorize URL" aria-label="Copy authorize URL">
                        ${icon('copy', 'w-3.5 h-3.5')}
                      </button>
                    </div>
                    <div class="authorize-url">${escapeHtml(authorizeUrl)}</div>
                  </div>
                </div>
              </div>
            `
                : `
              <div class="panel">
                <div class="panel-head">
                  <div>
                    <h2 class="panel-title">Endpoints &amp; APIs</h2>
                    <p class="panel-description">Standard Entra v2.0 routes plus local-only helpers for testing and automation.</p>
                  </div>
                  <span class="chip">${endpoints.length} routes</span>
                </div>
                <div class="panel-body">
                  <div class="endpoint-toolbar">
                    <div class="search-box">
                      ${icon('search', 'w-3.5 h-3.5')}
                      <input class="input" id="endpointSearchInput" placeholder="Search endpoints" value="${escapeHtml(endpointQuery)}" />
                    </div>
                    <div class="filter-row">
                      <button type="button" class="filter-button${endpointFilter === 'all' ? ' is-active' : ''}" data-filter="all">All</button>
                      <button type="button" class="filter-button${endpointFilter === 'standard' ? ' is-active' : ''}" data-filter="standard">Standard</button>
                      <button type="button" class="filter-button${endpointFilter === 'mock' ? ' is-active' : ''}" data-filter="mock">Mock helpers</button>
                    </div>
                  </div>

                  <div class="endpoint-list" id="endpointListContainer">
                    ${endpoints
                      .filter((ep) => {
                        const matchFilter = endpointFilter === 'all' || ep.kind === endpointFilter;
                        const matchQuery =
                          !endpointQuery ||
                          ep.name.toLowerCase().includes(endpointQuery.toLowerCase()) ||
                          ep.url.toLowerCase().includes(endpointQuery.toLowerCase()) ||
                          ep.description.toLowerCase().includes(endpointQuery.toLowerCase());
                        return matchFilter && matchQuery;
                      })
                      .map((ep) => {
                        return `
                        <div class="endpoint-row" data-endpoint-id="${ep.id}">
                          <div class="endpoint-main">
                            <button type="button" class="endpoint-toggle" data-toggle="${ep.id}">
                              <span class="method method-${ep.method.toLowerCase()}">${ep.method}</span>
                              <span class="endpoint-identity">
                                <span class="endpoint-name-row">
                                  <span class="endpoint-name">${escapeHtml(ep.name)}</span>
                                  ${ep.kind === 'mock' ? `<span class="chip chip-accent">Local helper</span>` : ''}
                                </span>
                                <span class="endpoint-url" title="${escapeHtml(ep.url)}">${escapeHtml(ep.url)}</span>
                              </span>
                            </button>
                            <div class="endpoint-actions">
                              <button type="button" class="copy-button" data-copy-val="${escapeHtml(ep.url)}" title="Copy endpoint URL">
                                ${icon('copy', 'w-3 h-3')}
                              </button>
                              <button type="button" class="icon-button" data-toggle="${ep.id}" title="Toggle details">
                                ${icon('chevron-down', 'w-3.5 h-3.5 endpoint-chevron')}
                              </button>
                            </div>
                          </div>
                          <div class="endpoint-detail" id="detail-${ep.id}" hidden>
                            <p class="endpoint-description">${escapeHtml(ep.description)}</p>
                            <div class="sample-grid">
                              <div class="sample-block">
                                <div class="sample-head">
                                  <span>Request sample</span>
                                  <button type="button" class="copy-button" data-copy-val="${escapeHtml(ep.request)}" title="Copy request sample">
                                    ${icon('copy', 'w-3 h-3')}
                                  </button>
                                </div>
                                <pre class="sample-code"><code class="language-bash">${highlightCode(ep.request, 'bash')}</code></pre>
                              </div>
                              <div class="sample-block">
                                <div class="sample-head">
                                  <span>${escapeHtml(ep.responseLabel)}</span>
                                  <button type="button" class="copy-button" data-copy-val="${escapeHtml(ep.response)}" title="Copy response sample">
                                    ${icon('copy', 'w-3 h-3')}
                                  </button>
                                </div>
                                <pre class="sample-code"><code class="language-${ep.response.trim().startsWith('{') ? 'json' : 'bash'}">${highlightCode(ep.response, ep.response.trim().startsWith('{') ? 'json' : 'bash')}</code></pre>
                              </div>
                            </div>
                          </div>
                        </div>
                      `;
                      })
                      .join('')}
                  </div>
                </div>
              </div>
            `
            }
          </div>

          <aside class="aside-sticky">
            <div class="aside-panel">
              <div class="aside-title">
                Connection summary <span class="chip chip-green"><span class="dot"></span>Ready</span>
              </div>
              <div class="aside-row">
                <span class="aside-row-label">Discovery</span>
                <span class="aside-row-value" title="${escapeHtml(getAuthority(project))}/oauth2/v2.0/.well-known/openid-configuration">…/openid-configuration</span>
              </div>
              <div class="aside-row">
                <span class="aside-row-label">Tenant</span>
                <span class="aside-row-value" title="${escapeHtml(project.tenant)}">${escapeHtml(project.tenant)}</span>
              </div>
              <div class="aside-row">
                <span class="aside-row-label">Client</span>
                <span class="aside-row-value" title="${escapeHtml(project.clientId)}">${escapeHtml(project.clientId)}</span>
              </div>
              <div class="aside-row">
                <span class="aside-row-label">Redirect</span>
                <span class="aside-row-value" title="${escapeHtml(project.redirectUri)}">${escapeHtml(project.redirectUri)}</span>
              </div>
              <div class="aside-row">
                <span class="aside-row-label">PKCE</span>
                <span class="aside-row-value">S256 (SHA-256)</span>
              </div>
              <div class="authorize-block" style="margin-top: 14px;">
                <a class="btn btn-secondary btn-block" href="#login">
                  ${icon('zap', 'w-3.5 h-3.5')} Test the flow
                </a>
              </div>
            </div>

            <div class="aside-panel">
              <div class="aside-title">Local mock notes</div>
              <p class="aside-note" style="margin-top:0; padding-top:0; border-top:0;">The provider accepts any client secret. Discovery, JWKS, and token shapes follow the Entra v2.0 protocol so standard OIDC clients connect without changes.</p>
              <div class="authority-card">
                <div class="authority-label">
                  <span class="status-dot"></span> ${project.issuerMode === 'entra' ? 'Microsoft issuer' : 'Host issuer'}
                </div>
                <div class="authority-value" title="${escapeHtml(getIssuerValue(project))}">${escapeHtml(getIssuerValue(project))}</div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    `;

    // Tab handlers
    document.getElementById('tabBtnSettings')?.addEventListener('click', () => {
      activeTab = 'settings';
      render();
    });
    document.getElementById('tabBtnEndpoints')?.addEventListener('click', () => {
      activeTab = 'endpoints';
      render();
    });

    if (activeTab === 'settings') {
      document.getElementById('btnCopySecret')?.addEventListener('click', () => {
        navigator.clipboard.writeText(project.clientSecret || '');
        showToast('Copied client secret');
      });
      document.getElementById('btnCopyAuthUrl')?.addEventListener('click', () => {
        navigator.clipboard.writeText(authorizeUrl);
        showToast('Copied Authorize URL');
      });

      document.getElementById('btnResetSettings')?.addEventListener('click', () => {
        render();
        showToast('Settings reset');
      });

      document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = (document.getElementById('settingName') as HTMLInputElement).value.trim();
        const rootUrl = (document.getElementById('settingRoot') as HTMLInputElement).value.trim();
        const redirectUri = (document.getElementById('settingRedirect') as HTMLInputElement).value.trim();
        const tenant = (document.getElementById('settingTenant') as HTMLInputElement).value.trim();
        const clientId = (document.getElementById('settingClientId') as HTMLInputElement).value.trim();
        const scope = (document.getElementById('settingScope') as HTMLInputElement).value.trim();
        const host = (document.getElementById('settingHost') as HTMLInputElement).value.trim();
        const issuerMode = (document.getElementById('settingIssuer') as HTMLSelectElement).value as 'host' | 'entra';

        if (!name || !tenant || !clientId || !redirectUri) {
          showToast('Please fill in required fields', 'error');
          return;
        }

        project.name = name;
        project.rootUrl = rootUrl.replace(/\/+$/, '');
        project.redirectUri = redirectUri;
        project.tenant = tenant;
        project.clientId = clientId;
        project.scope = scope;
        project.host = host ? host.replace(/\/+$/, '') : '';
        project.issuerMode = issuerMode;

        saveActiveProject(project);
        showToast('Project settings saved successfully');
        if (onProjectChange) onProjectChange();
        render();
      });
    } else {
      // Endpoints tab handlers
      const searchInput = document.getElementById('endpointSearchInput') as HTMLInputElement | null;
      searchInput?.addEventListener('input', () => {
        endpointQuery = searchInput.value;
        render();
        // re-focus after render
        const newSearch = document.getElementById('endpointSearchInput') as HTMLInputElement | null;
        if (newSearch) {
          newSearch.focus();
          newSearch.setSelectionRange(endpointQuery.length, endpointQuery.length);
        }
      });

      container.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => {
        b.addEventListener('click', () => {
          endpointFilter = b.dataset.filter as any;
          render();
        });
      });

      container.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.toggle!;
          const detail = document.getElementById(`detail-${id}`);
          const row = container.querySelector(`[data-endpoint-id="${id}"]`);
          if (detail && row) {
            const isHidden = detail.hidden;
            detail.hidden = !isHidden;
            row.classList.toggle('is-open', isHidden);
          }
        });
      });

      container.querySelectorAll<HTMLButtonElement>('[data-copy-val]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = btn.dataset.copyVal || '';
          navigator.clipboard.writeText(val);
          showToast('Copied to clipboard');
        });
      });
    }
  };

  render();
}
