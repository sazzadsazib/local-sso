import { getActiveProject, getProjects, saveActiveProject, setActiveProjectId, deleteProject } from '../storage';
import { Profile } from '../types';
import { showToast } from '../components/toast';
import { icon } from '../components/icons';
import { highlightCode } from '../components/highlight';

export function renderConfigView(container: HTMLElement) {
  const project = getActiveProject();
  const projects = getProjects();
  const effectiveOrigin = (project.host && project.host.trim())
    ? project.host.trim().replace(/\/+$/, '')
    : window.location.origin;

  const tenant = project.tenant || 'common';
  const issuerMode = project.issuerMode || 'host';
  const issuerUrl = issuerMode === 'entra'
    ? `https://login.microsoftonline.com/${tenant}/v2.0`
    : `${effectiveOrigin}/${tenant}/v2.0`;

  const authorityUrl = `${effectiveOrigin}/${tenant}`;
  const discoveryUrl = `${effectiveOrigin}/${tenant}/v2.0/.well-known/openid-configuration`;
  const authorizeUrl = `${effectiveOrigin}/${tenant}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(
    project.clientId
  )}&response_type=code&redirect_uri=${encodeURIComponent(
    project.redirectUri
  )}&response_mode=query&scope=${encodeURIComponent(
    project.scope
  )}&state=12345&nonce=67890`;
  const tokenUrl = `${effectiveOrigin}/${tenant}/oauth2/v2.0/token`;
  const jwksUrl = `${effectiveOrigin}/${tenant}/discovery/v2.0/keys`;
  const logoutUrl = `${effectiveOrigin}/${tenant}/oauth2/v2.0/logout`;
  const userinfoUrl = `${effectiveOrigin}/${tenant}/oidc/userinfo`;
  const usersApiUrl = `${effectiveOrigin}/api/users`;
  const authorizeBaseUrl = `${effectiveOrigin}/${tenant}/oauth2/v2.0/authorize`;

  let knownHost = window.location.host;
  try {
    knownHost = new URL(effectiveOrigin).host;
  } catch {}

  const msalSnippet = `// @azure/msal-browser / React MSAL configuration for local dev
import { PublicClientApplication } from "@azure/msal-browser";

export const msalConfig = {
  auth: {
    clientId: "${project.clientId}",
    authority: "${authorityUrl}",
    knownAuthorities: ["${knownHost}"],
    redirectUri: "${project.redirectUri}",
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  }
};

export const msalInstance = new PublicClientApplication(msalConfig);`;

  const curlCodeSnippet = `curl -X POST "${tokenUrl}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "client_id=${project.clientId}" \\
  -d "grant_type=authorization_code" \\
  -d "code=AUTHORIZATION_CODE" \\
  -d "code_verifier=PKCE_CODE_VERIFIER" \\
  -d "redirect_uri=${project.redirectUri}"`;

  const curlRefreshSnippet = `curl -X POST "${tokenUrl}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "client_id=${project.clientId}" \\
  -d "grant_type=refresh_token" \\
  -d "refresh_token=REFRESH_TOKEN" \\
  -d "scope=${project.scope}"`;


  const tokenProxyUrl = `${effectiveOrigin}/api/token`;
  const verifyApiUrl = `${effectiveOrigin}/api/verify`;

  const endpointsList = [
    {
      name: 'OIDC Authorize Endpoint',
      method: 'GET' as const,
      url: authorizeBaseUrl,
      isCustomMock: false,
      description: 'Standard Entra v2.0: Initiates OAuth2/OIDC sign-in flow and returns an authorization code with PKCE protection.',
      requestSample: `GET /${tenant}/oauth2/v2.0/authorize?client_id=${project.clientId}&response_type=code&redirect_uri=${encodeURIComponent(project.redirectUri)}&scope=${encodeURIComponent(project.scope)}&response_mode=query&state=xyz123&code_challenge=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk&code_challenge_method=S256&prompt=select_account HTTP/1.1\nHost: ${knownHost}`,
      responseStatus: '302 Found (Redirect with Code)',
      responseSample: `HTTP/1.1 302 Found\nLocation: ${project.redirectUri}?code=mock_code_8f2b1d9c&state=xyz123`,
    },
    {
      name: 'OAuth2 Token Endpoint',
      method: 'POST' as const,
      url: tokenUrl,
      isCustomMock: false,
      description: 'Standard Entra v2.0: Redeems authorization code + PKCE verifier or refresh token for RS256 ID & Access tokens.',
      requestSample: `POST /${tenant}/oauth2/v2.0/token HTTP/1.1\nHost: ${knownHost}\nContent-Type: application/x-www-form-urlencoded\n\ngrant_type=authorization_code\n&client_id=${project.clientId}\n&code=mock_code_8f2b1d9c\n&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk\n&redirect_uri=${encodeURIComponent(project.redirectUri)}`,
      responseStatus: '200 OK (application/json)',
      responseSample: JSON.stringify(
        {
          token_type: 'Bearer',
          scope: project.scope,
          expires_in: 3600,
          access_token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6InNzby1sb2NhbC1hY3RpdmUta2V5IiwidHlwIjoiSldUIn0.ey...',
          id_token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6InNzby1sb2NhbC1hY3RpdmUta2V5IiwidHlwIjoiSldUIn0.ey...',
          refresh_token: 'local-sso-refresh-8f2b1d9c4e0a7',
        },
        null,
        2
      ),
    },
    {
      name: 'OIDC UserInfo Endpoint',
      method: 'GET' as const,
      url: userinfoUrl,
      isCustomMock: true,
      description: 'Non-standard Entra extension: Real Microsoft Entra ID omits standard /userinfo (uses Microsoft Graph API). Provided by local-sso for compatibility with generic OIDC libraries (Better Auth, NextAuth, Spring). Use if needed by your client.',
      requestSample: `GET /${tenant}/oidc/userinfo HTTP/1.1\nHost: ${knownHost}\nAuthorization: Bearer <access_token>`,
      responseStatus: '200 OK (application/json)',
      responseSample: JSON.stringify(
        {
          sub: 'sub-sazzad-sazib-001',
          name: 'Sazzad Sazib',
          given_name: 'Sazzad',
          family_name: 'Sazib',
          preferred_username: 'sazib@gmail.com',
          email: 'sazib@gmail.com',
          email_verified: true,
          tid: tenant,
          oid: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
          roles: ['Global Administrator', 'User'],
          groups: ['Engineers', 'Admins'],
          department: 'Engineering',
          job_title: 'Principal Security Engineer',
        },
        null,
        2
      ),
    },
    {
      name: 'Browser CORS Token Proxy',
      method: 'POST' as const,
      url: tokenProxyUrl,
      isCustomMock: true,
      description: 'Non-standard Entra helper: CORS-friendly JSON token exchange endpoint for browser SPAs and test scripts to exchange codes without cross-origin issues.',
      requestSample: `POST /api/token HTTP/1.1\nHost: ${knownHost}\nContent-Type: application/json\n\n{\n  "token_url": "${tokenUrl}",\n  "client_id": "${project.clientId}",\n  "code": "mock_code_8f2b1d9c",\n  "code_verifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",\n  "redirect_uri": "${project.redirectUri}"\n}`,
      responseStatus: '200 OK (application/json)',
      responseSample: JSON.stringify(
        {
          access_token: 'eyJhbGciOiJSUzI1NiIs...',
          id_token: 'eyJhbGciOiJSUzI1NiIs...',
          token_type: 'Bearer',
          expires_in: 3600,
        },
        null,
        2
      ),
    },
    {
      name: 'Token Signature & Claims Validator',
      method: 'POST' as const,
      url: verifyApiUrl,
      isCustomMock: true,
      description: 'Non-standard Entra helper: Cryptographically validates RS256 signatures against the local JWKS and returns verified claims payload for client-side test automation.',
      requestSample: `POST /api/verify HTTP/1.1\nHost: ${knownHost}\nContent-Type: application/json\n\n{\n  "id_token": "eyJhbGciOiJSUzI1NiIs...",\n  "jwks_uri": "${jwksUrl}",\n  "issuer": "${issuerUrl}",\n  "audience": "${project.clientId}"\n}`,
      responseStatus: '200 OK (application/json)',
      responseSample: JSON.stringify(
        {
          verified: true,
          claims: {
            sub: 'sub-sazzad-sazib-001',
            name: 'Sazzad Sazib',
            email: 'sazib@gmail.com',
            roles: ['Global Administrator', 'User'],
          },
        },
        null,
        2
      ),
    },
    {
      name: 'Directory Mock Users API',
      method: 'GET' as const,
      url: usersApiUrl,
      isCustomMock: true,
      description: 'Non-standard Entra helper: REST API to list, create, and manage mock personas and claims without requiring Microsoft Graph admin permissions.',
      requestSample: `GET /api/users HTTP/1.1\nHost: ${knownHost}\nAccept: application/json`,
      responseStatus: '200 OK (application/json)',
      responseSample: JSON.stringify(
        [
          {
            id: 'user-1',
            name: 'Sazzad Sazib',
            email: 'sazib@gmail.com',
            preferred_username: 'sazib@gmail.com',
            avatar_url: 'https://avatars.githubusercontent.com/u/8937268?v=4',
            roles: ['Global Administrator', 'User'],
            groups: ['Engineers', 'Admins'],
          },
          {
            id: 'user-2',
            name: 'Iftekhar Rifat',
            email: 'rifat@gmail.com',
            preferred_username: 'rifat@gmail.com',
            avatar_url: 'https://avatars.githubusercontent.com/u/124599?v=4',
            roles: ['Application Developer', 'User'],
            groups: ['Developers'],
          },
        ],
        null,
        2
      ),
    },
    {
      name: 'OpenID Discovery Document (.well-known)',
      method: 'GET' as const,
      url: discoveryUrl,
      isCustomMock: false,
      description: 'Standard Entra v2.0: Auto-discovery configuration document (.well-known) used by OIDC libraries (NextAuth, Better Auth, Supabase, Spring Boot).',
      requestSample: `GET /${tenant}/v2.0/.well-known/openid-configuration HTTP/1.1\nHost: ${knownHost}\nAccept: application/json`,
      responseStatus: '200 OK (application/json)',
      responseSample: JSON.stringify(
        {
          issuer: issuerUrl,
          authorization_endpoint: authorizeBaseUrl,
          token_endpoint: tokenUrl,
          userinfo_endpoint: userinfoUrl,
          jwks_uri: jwksUrl,
          end_session_endpoint: logoutUrl,
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
      name: 'JWKS Public Keys (RS256)',
      method: 'GET' as const,
      url: jwksUrl,
      isCustomMock: false,
      description: 'Standard Entra v2.0: JSON Web Key Set containing RSA public keys used by resource servers to verify token signatures.',
      requestSample: `GET /${tenant}/discovery/v2.0/keys HTTP/1.1\nHost: ${knownHost}\nAccept: application/json`,
      responseStatus: '200 OK (application/json)',
      responseSample: JSON.stringify(
        {
          keys: [
            {
              kty: 'RSA',
              use: 'sig',
              alg: 'RS256',
              kid: 'local-sso-active-key',
              n: 'u9h3K8x2Y_... (2048-bit RSA Modulus)',
              e: 'AQAB',
            },
          ],
        },
        null,
        2
      ),
    },
    {
      name: 'OIDC Token Issuer (iss claim)',
      method: 'CONFIG' as const,
      url: issuerUrl,
      isCustomMock: false,
      description: 'Standard Entra v2.0: The expected OIDC token issuer URI validated against the "iss" claim inside signed ID tokens.',
      requestSample: `// Decoded ID Token Payload Claim:\n{\n  "iss": "${issuerUrl}",\n  "aud": "${project.clientId}",\n  "sub": "sub-sazzad-sazib-001",\n  "tid": "${tenant}"\n}`,
      responseStatus: 'JWT Claims Match',
      responseSample: `iss == "${issuerUrl}"\naud == "${project.clientId}"\nSignature: Validated via JWKS`,
    },
    {
      name: 'Authority URL (MSAL.js)',
      method: 'CONFIG' as const,
      url: authorityUrl,
      isCustomMock: false,
      description: 'Standard Entra v2.0: Base authority string configured in @azure/msal-browser PublicClientApplication.',
      requestSample: `import { PublicClientApplication } from "@azure/msal-browser";\n\nexport const msal = new PublicClientApplication({\n  auth: {\n    clientId: "${project.clientId}",\n    authority: "${authorityUrl}",\n    knownAuthorities: ["${knownHost}"]\n  }\n});`,
      responseStatus: 'MSAL Instance Config',
      responseSample: `{\n  "authority": "${authorityUrl}",\n  "knownAuthorities": ["${knownHost}"]\n}`,
    },
    {
      name: 'End Session / Logout',
      method: 'GET' as const,
      url: logoutUrl,
      isCustomMock: false,
      description: 'Standard Entra v2.0: Terminates SSO session and redirects user to post_logout_redirect_uri.',
      requestSample: `GET /${tenant}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(project.rootUrl || 'http://localhost:3000')} HTTP/1.1\nHost: ${knownHost}`,
      responseStatus: '302 Found (Redirect)',
      responseSample: `HTTP/1.1 302 Found\nLocation: ${project.rootUrl || 'http://localhost:3000'}`,
    },
  ];

  const standardEndpoints = endpointsList.filter((e) => !e.isCustomMock);
  const customEndpoints = endpointsList.filter((e) => e.isCustomMock);

  function renderEndpointCard(item: (typeof endpointsList)[0]): string {
    const methodBadge = {
      GET: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
      POST: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      CONFIG: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    }[item.method];

    return `
      <div class="p-3.5 bg-slate-900/90 hover:bg-slate-900 rounded-xl border border-slate-800 transition space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 flex-wrap min-w-0">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider border ${methodBadge}">${item.method}</span>
            <span class="text-white font-sans font-semibold text-xs truncate">${item.name}</span>
            ${item.isCustomMock
              ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  Custom for Mock (Optional)
                </span>`
              : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                  Standard Entra v2.0
                </span>`
            }
          </div>
          <button data-copy="${item.url}" class="copy-btn shrink-0 p-1.5 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-md transition" aria-label="Copy URL" title="Copy URL">
            ${icon('clipboard', 'w-3.5 h-3.5')}
          </button>
        </div>

        <div class="bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-800/60 overflow-hidden">
          <span class="text-slate-300 text-[11px] font-mono break-all select-all block">${item.url}</span>
        </div>

        <p class="text-[11px] font-sans text-slate-400 leading-relaxed">${item.description}</p>

        <!-- Collapsible Request & Response Sample -->
        <details class="group border-t border-slate-800/80 pt-2 text-xs">
          <summary class="cursor-pointer text-[11px] font-sans text-sky-400 hover:text-sky-300 flex items-center justify-between transition select-none py-1">
            <span class="flex items-center gap-1.5 font-medium">
              ${icon('terminal', 'w-3 h-3 text-orange-400')}
              <span>Request &amp; Response Samples</span>
            </span>
            <span class="group-open:rotate-180 transition-transform text-slate-400">
              ${icon('chevron-down', 'w-3.5 h-3.5')}
            </span>
          </summary>
          <div class="mt-2.5 space-y-3 font-sans">
            <!-- Request -->
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[10px] text-slate-400">
                <span class="font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                  ${icon('zap', 'w-3 h-3 text-sky-400')} Request Sample
                </span>
                <button data-copy="${encodeURIComponent(item.requestSample)}" class="copy-encoded-btn text-sky-400 hover:underline">Copy Request</button>
              </div>
              <pre class="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono overflow-x-auto whitespace-pre leading-relaxed"><code class="language-bash">${highlightCode(item.requestSample, 'bash')}</code></pre>
            </div>

            <!-- Response -->
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[10px] text-slate-400">
                <span class="font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                  ${icon('check-circle', 'w-3 h-3 text-emerald-400')} ${item.responseStatus || '200 OK Response'}
                </span>
                <button data-copy="${encodeURIComponent(item.responseSample)}" class="copy-encoded-btn text-sky-400 hover:underline">Copy Response</button>
              </div>
              <pre class="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono overflow-x-auto whitespace-pre leading-relaxed"><code class="language-json">${highlightCode(item.responseSample, 'json')}</code></pre>
            </div>
          </div>
        </details>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      <!-- Top Banner / Project Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-6 rounded-2xl">
        <div>
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <h1 class="text-2xl font-bold text-white">SSO Configuration</h1>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">Active</span>
          </div>
          <p class="text-sm text-slate-400">Project: <span class="text-white font-medium">${project.name}</span> &mdash; <span class="font-mono text-xs">${project.rootUrl || '—'}</span></p>
          <p class="text-sm text-slate-400 mt-0.5">Configure your local Microsoft Entra ID tenant parameters and copy endpoints for your frontend application.</p>
        </div>

        <div class="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select id="projectSelector" class="flex-1 min-w-0 md:flex-none md:w-auto bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-sky-500 focus:outline-none">
            ${projects
              .map(
                (p) => `<option value="${p.id}" ${p.id === project.id ? 'selected' : ''}>${p.name} (${p.rootUrl})</option>`
              )
              .join('')}
          </select>
          <button id="btnNewProject" class="shrink-0 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition flex items-center gap-1.5" aria-label="New project">
            ${icon('plus', 'w-3.5 h-3.5', 2.25)} New
          </button>
        </div>
      </div>

      <!-- Quick Frontend Redirect URL Card -->
      <div class="tilt-card glass-panel glass-hero p-6 rounded-2xl relative overflow-hidden">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="p-2 rounded-lg bg-sky-500/20 text-sky-400 shrink-0">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </div>
            <div class="min-w-0">
              <h2 class="text-lg font-bold text-white">Frontend Redirect Authorize URL</h2>
              <p class="text-xs text-slate-400">Direct your frontend login button/session generator to this URL to trigger Microsoft Entra auth flow</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 shrink-0">
            <button id="copyAuthorizeUrl" class="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold rounded-lg shadow-md shadow-sky-500/20 transition flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
              Copy Authorize URL
            </button>
            <a href="${authorizeUrl}" target="_blank" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center gap-1">
              Test Launch ${icon('arrow-up-right', 'w-3.5 h-3.5')}
            </a>
          </div>
        </div>

        <div class="auth-preview-url p-3 rounded-xl border font-mono text-xs break-all select-all leading-relaxed">
          ${authorizeUrl}
        </div>
      </div>

      <!-- Main Config Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <!-- Left: Configuration Form -->
        <div class="lg:col-span-5 space-y-6">
          <div class="glass-panel glass-hover p-6 rounded-2xl space-y-5">
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              ${icon('settings', 'w-4 h-4 text-orange-400')} Project SSO Settings
            </h3>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5">Project Name</label>
                <input id="inputName" type="text" value="${project.name}" class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5">Project Root URL</label>
                <input id="inputRootUrl" type="text" value="${project.rootUrl || ''}" placeholder="e.g. http://localhost:3000" class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
                <p class="mt-1 text-[11px] text-slate-500">Root URL of your frontend application. Used to build authorization links for this project.</p>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5">
                  Tenant (Alias or GUID)
                  <span class="text-[10px] text-slate-500 font-normal">("common", "organizations", "consumers", or tenant GUID)</span>
                </label>
                <input id="inputTenant" type="text" value="${project.tenant}" class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5">Application (Client) ID</label>
                <input id="inputClientId" type="text" value="${project.clientId}" class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5">Redirect URI (Frontend Callback)</label>
                <input id="inputRedirectUri" type="text" value="${project.redirectUri}" class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                  <span>Host Origin / Base URL</span>
                  <span class="text-[10px] text-sky-400 font-normal">Active: ${effectiveOrigin}</span>
                </label>
                <input id="inputHost" type="text" placeholder="e.g. https://xxxx.ngrok-free.app or ${window.location.origin}" value="${project.host || ''}" class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white placeholder-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none" />
                <p class="mt-1 text-[11px] text-slate-500">Base host origin for endpoints &amp; snippets. Configure with your ngrok HTTPS URL when exposing externally.</p>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                  <span>OIDC Issuer Format</span>
                  <span class="text-[10px] text-slate-500 font-normal font-mono truncate max-w-[200px]">${issuerUrl}</span>
                </label>
                <select id="selectIssuerMode" class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none">
                  <option value="host" ${issuerMode !== 'entra' ? 'selected' : ''}>Host Origin (${effectiveOrigin}/${tenant}/v2.0) [Recommended]</option>
                  <option value="entra" ${issuerMode === 'entra' ? 'selected' : ''}>Microsoft Entra ID (https://login.microsoftonline.com/${tenant}/v2.0)</option>
                </select>
                <p class="mt-1 text-[11px] text-slate-500">Specifies the <code class="text-slate-400">iss</code> claim in ID tokens and discovery document.</p>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5">OAuth Scopes</label>
                <input id="inputScope" type="text" value="${project.scope}" class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
              </div>
            </div>

            <div class="pt-2 flex flex-wrap items-center justify-between gap-2">
              <button id="btnSaveConfig" class="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-sky-600/20">
                Save Changes
              </button>
              ${
                projects.length > 1
                  ? `<button id="btnDeleteProject" class="px-3.5 py-2 text-rose-400 hover:text-rose-300 text-xs font-medium hover:bg-rose-500/10 rounded-lg transition">Delete Project</button>`
                  : ''
              }
            </div>
          </div>

          <!-- Code Snippets Tabs (Moved under Project SSO Settings for height balance) -->
          <div class="glass-panel glass-hover p-6 rounded-2xl space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-base font-bold text-white flex items-center gap-2">
                ${icon('terminal', 'w-4 h-4 text-orange-400')} Frontend &amp; CLI Integration Snippets
              </h3>
              <div class="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
                <button id="tabMsal" class="px-2.5 py-1 rounded-md bg-sky-500/20 text-sky-400 font-medium">MSAL.js</button>
                <button id="tabCurl" class="px-2.5 py-1 rounded-md text-slate-400 hover:text-white">cURL</button>
              </div>
            </div>

            <!-- MSAL.js Box -->
            <div id="boxMsal" class="space-y-2">
              <div class="flex flex-wrap justify-between items-center gap-2 text-xs text-slate-400">
                <span>Configure your frontend @azure/msal-browser instance:</span>
                <button data-copy="${encodeURIComponent(msalSnippet)}" class="copy-encoded-btn text-sky-400 hover:underline">Copy Code</button>
              </div>
              <pre class="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono overflow-x-auto"><code class="language-typescript">${highlightCode(msalSnippet, 'typescript')}</code></pre>
            </div>

            <!-- cURL Box -->
            <div id="boxCurl" class="space-y-4 hidden">
              <div>
                <div class="flex flex-wrap justify-between items-center gap-2 text-xs text-slate-400 mb-1">
                  <span>1. Exchange Authorization Code for Tokens:</span>
                  <button data-copy="${encodeURIComponent(curlCodeSnippet)}" class="copy-encoded-btn text-sky-400 hover:underline">Copy cURL</button>
                </div>
                <pre class="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono overflow-x-auto"><code class="language-bash">${highlightCode(curlCodeSnippet, 'bash')}</code></pre>
              </div>

              <div>
                <div class="flex flex-wrap justify-between items-center gap-2 text-xs text-slate-400 mb-1">
                  <span>2. Refresh Token Grant:</span>
                  <button data-copy="${encodeURIComponent(curlRefreshSnippet)}" class="copy-encoded-btn text-sky-400 hover:underline">Copy cURL</button>
                </div>
                <pre class="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono overflow-x-auto"><code class="language-bash">${highlightCode(curlRefreshSnippet, 'bash')}</code></pre>
              </div>
            </div>

          </div>

        </div>

        <!-- Right: Standard Entra Endpoints -->
        <div class="lg:col-span-7 space-y-6">
          
          <div class="glass-panel glass-hover p-6 rounded-2xl space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-base font-bold text-white flex items-center gap-2">
                ${icon('globe', 'w-4 h-4 text-sky-400')} Standard Microsoft Entra v2.0 Endpoints
              </h3>
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                ${standardEndpoints.length} Endpoints
              </span>
            </div>

            <p class="text-xs text-slate-400">
              Standard OpenID Connect and OAuth 2.0 endpoints compliant with the official Microsoft Entra ID v2.0 specification.
            </p>

            <div class="space-y-3 font-sans">
              ${standardEndpoints.map((ep) => renderEndpointCard(ep)).join('')}
            </div>
          </div>

        </div>

      </div>

      <!-- Bottom Section: Custom for Mock Endpoints -->
      <div class="glass-panel glass-hover p-6 rounded-2xl space-y-5 border border-amber-500/20 shadow-xl shadow-amber-500/5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <div class="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              ${icon('zap', 'w-4 h-4')}
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-base font-bold text-white">Custom Mock Endpoints &amp; Helper APIs</h3>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Custom for Mock (Optional)
                </span>
              </div>
              <p class="text-xs text-slate-400 mt-0.5">Non-standard extensions provided by local-sso to ease mock integration testing and generic OIDC library compatibility.</p>
            </div>
          </div>
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            ${customEndpoints.length} Helper Endpoints
          </span>
        </div>

        <!-- Informational Callout regarding why these exist -->
        <div class="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] text-xs text-slate-300 flex items-start gap-3">
          <div class="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
            ${icon('info', 'w-4 h-4')}
          </div>
          <div class="space-y-1">
            <span class="font-semibold text-amber-300 text-xs">Standard Entra vs. Custom for Mock Helpers</span>
            <p class="text-slate-400 text-[11px] leading-relaxed">
              Official Microsoft Entra v2.0 does not supply a standard OIDC <code>/userinfo</code> endpoint (it uses Microsoft Graph instead). Generic OIDC clients (such as <strong>Better Auth</strong>, <strong>NextAuth</strong>, <strong>Spring Security</strong>, etc.) often expect a standard UserInfo endpoint or simplified token APIs to function without complex Graph SDK configuration. If your client wants them, you can freely use them; otherwise, stick exclusively to the standard Entra v2.0 endpoints above.
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 font-sans">
          ${customEndpoints.map((ep) => renderEndpointCard(ep)).join('')}
        </div>
      </div>

    </div>
  `;

  // Attach Event Handlers
  document.getElementById('projectSelector')?.addEventListener('change', (e) => {
    setActiveProjectId((e.target as HTMLSelectElement).value);
    renderConfigView(container);
    showToast('Project switched');
  });

  document.getElementById('btnNewProject')?.addEventListener('click', () => {
    const newP: Profile = {
      id: 'project-' + Date.now(),
      name: 'Custom Project',
      rootUrl: 'http://localhost:3000',
      provider: 'entra',
      tenant: 'common',
      clientId: '00000000-0000-0000-0000-000000000002',
      redirectUri: 'http://localhost:3000/callback',
      scope: 'openid profile email offline_access',
      host: '',
      issuerMode: 'host',
    };
    saveActiveProject(newP);
    renderConfigView(container);
    showToast('Created new project');
  });

  document.getElementById('btnSaveConfig')?.addEventListener('click', () => {
    const updated: Profile = {
      ...project,
      name: (document.getElementById('inputName') as HTMLInputElement).value,
      rootUrl: (document.getElementById('inputRootUrl') as HTMLInputElement).value.trim(),
      tenant: (document.getElementById('inputTenant') as HTMLInputElement).value,
      clientId: (document.getElementById('inputClientId') as HTMLInputElement).value,
      redirectUri: (document.getElementById('inputRedirectUri') as HTMLInputElement).value,
      scope: (document.getElementById('inputScope') as HTMLInputElement).value,
      host: (document.getElementById('inputHost') as HTMLInputElement).value.trim(),
      issuerMode: (document.getElementById('selectIssuerMode') as HTMLSelectElement).value as 'host' | 'entra',
    };
    saveActiveProject(updated);
    renderConfigView(container);
    showToast('Project saved successfully');
  });

  document.getElementById('btnDeleteProject')?.addEventListener('click', () => {
    if (confirm('Delete this project?')) {
      deleteProject(project.id);
      renderConfigView(container);
      showToast('Project deleted');
    }
  });

  document.getElementById('copyAuthorizeUrl')?.addEventListener('click', () => {
    navigator.clipboard.writeText(authorizeUrl);
    showToast('Copied full Authorize URL to clipboard!');
  });

  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy') || '';
      navigator.clipboard.writeText(text);
      showToast('Copied endpoint URL to clipboard!');
    });
  });

  document.querySelectorAll('.copy-encoded-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = decodeURIComponent(btn.getAttribute('data-copy') || '');
      navigator.clipboard.writeText(text);
      showToast('Copied snippet to clipboard!');
    });
  });

  // Tab switching
  const tabMsal = document.getElementById('tabMsal');
  const tabCurl = document.getElementById('tabCurl');
  const boxMsal = document.getElementById('boxMsal');
  const boxCurl = document.getElementById('boxCurl');

  tabMsal?.addEventListener('click', () => {
    tabMsal.className = 'px-2.5 py-1 rounded-md bg-sky-500/20 text-sky-400 font-medium';
    tabCurl!.className = 'px-2.5 py-1 rounded-md text-slate-400 hover:text-white';
    boxMsal?.classList.remove('hidden');
    boxCurl?.classList.add('hidden');
  });

  tabCurl?.addEventListener('click', () => {
    tabCurl.className = 'px-2.5 py-1 rounded-md bg-sky-500/20 text-sky-400 font-medium';
    tabMsal!.className = 'px-2.5 py-1 rounded-md text-slate-400 hover:text-white';
    boxCurl?.classList.remove('hidden');
    boxMsal?.classList.add('hidden');
  });
}