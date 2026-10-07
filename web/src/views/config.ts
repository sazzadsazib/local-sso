import { getActiveProfile, getProfiles, saveActiveProfile, setActiveProfileId, deleteProfile } from '../storage';
import { Profile } from '../types';
import { showToast } from '../components/toast';
import { icon } from '../components/icons';

export function renderConfigView(container: HTMLElement) {
  const profile = getActiveProfile();
  const profiles = getProfiles();
  const origin = window.location.origin;

  const tenant = profile.tenant || 'common';
  const authorityUrl = `${origin}/${tenant}`;
  const discoveryUrl = `${origin}/${tenant}/v2.0/.well-known/openid-configuration`;
  const authorizeUrl = `${origin}/${tenant}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(
    profile.clientId
  )}&response_type=code&redirect_uri=${encodeURIComponent(
    profile.redirectUri
  )}&response_mode=query&scope=${encodeURIComponent(
    profile.scope
  )}&state=12345&nonce=67890`;
  const tokenUrl = `${origin}/${tenant}/oauth2/v2.0/token`;
  const jwksUrl = `${origin}/${tenant}/discovery/v2.0/keys`;
  const logoutUrl = `${origin}/${tenant}/oauth2/v2.0/logout`;

  const msalSnippet = `// @azure/msal-browser / React MSAL configuration for local dev
import { PublicClientApplication } from "@azure/msal-browser";

export const msalConfig = {
  auth: {
    clientId: "${profile.clientId}",
    authority: "${authorityUrl}",
    knownAuthorities: ["${window.location.host}"],
    redirectUri: "${profile.redirectUri}",
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  }
};

export const msalInstance = new PublicClientApplication(msalConfig);`;

  const curlCodeSnippet = `curl -X POST "${tokenUrl}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "client_id=${profile.clientId}" \\
  -d "grant_type=authorization_code" \\
  -d "code=AUTHORIZATION_CODE" \\
  -d "code_verifier=PKCE_CODE_VERIFIER" \\
  -d "redirect_uri=${profile.redirectUri}"`;

  const curlRefreshSnippet = `curl -X POST "${tokenUrl}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "client_id=${profile.clientId}" \\
  -d "grant_type=refresh_token" \\
  -d "refresh_token=REFRESH_TOKEN" \\
  -d "scope=${profile.scope}"`;

  container.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      <!-- Top Banner / Profile Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-6 rounded-2xl">
        <div>
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <h1 class="text-2xl font-bold text-white">Identity Provider & App Config</h1>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">Active</span>
          </div>
          <p class="text-sm text-slate-400">Configure your local Microsoft Entra ID tenant parameters and copy endpoints for your frontend application.</p>
        </div>

        <div class="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select id="profileSelector" class="flex-1 min-w-0 md:flex-none md:w-auto bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-sky-500 focus:outline-none">
            ${profiles
              .map(
                (p) => `<option value="${p.id}" ${p.id === profile.id ? 'selected' : ''}>${p.name} (${p.tenant})</option>`
              )
              .join('')}
          </select>
          <button id="btnNewProfile" class="shrink-0 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition flex items-center gap-1.5" aria-label="New profile">
            ${icon('plus', 'w-3.5 h-3.5', 2.25)} New
          </button>
        </div>
      </div>

      <!-- Quick Frontend Redirect URL Card -->
      <div class="glass-panel glass-hero p-6 rounded-2xl relative overflow-hidden">
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

        <div class="p-3 bg-slate-950/90 rounded-xl border border-slate-800 font-mono text-xs text-sky-300 break-all select-all">
          ${authorizeUrl}
        </div>
      </div>

      <!-- Main Config Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <!-- Left: Configuration Form -->
        <div class="lg:col-span-5 space-y-6">
          <div class="glass-panel glass-hover p-6 rounded-2xl space-y-5">
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              ${icon('settings', 'w-4 h-4 text-orange-400')} Profile Settings
            </h3>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5">Profile Name</label>
                <input id="inputName" type="text" value="${profile.name}" class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5">
                  Tenant (Alias or GUID)
                  <span class="text-[10px] text-slate-500 font-normal">("common", "organizations", "consumers", or tenant GUID)</span>
                </label>
                <input id="inputTenant" type="text" value="${profile.tenant}" class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5">Application (Client) ID</label>
                <input id="inputClientId" type="text" value="${profile.clientId}" class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5">Redirect URI (Frontend Callback)</label>
                <input id="inputRedirectUri" type="text" value="${profile.redirectUri}" class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-400 mb-1.5">OAuth Scopes</label>
                <input id="inputScope" type="text" value="${profile.scope}" class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
              </div>
            </div>

            <div class="pt-2 flex flex-wrap items-center justify-between gap-2">
              <button id="btnSaveConfig" class="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-sky-600/20">
                Save Changes
              </button>
              ${
                profiles.length > 1
                  ? `<button id="btnDeleteProfile" class="px-3.5 py-2 text-rose-400 hover:text-rose-300 text-xs font-medium hover:bg-rose-500/10 rounded-lg transition">Delete Profile</button>`
                  : ''
              }
            </div>
          </div>
        </div>

        <!-- Right: Endpoints & Integration Snippets -->
        <div class="lg:col-span-7 space-y-6">
          
          <!-- Endpoints List -->
          <div class="glass-panel glass-hover p-6 rounded-2xl space-y-4">
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              ${icon('globe', 'w-4 h-4 text-orange-400')} Standard Microsoft Entra v2.0 Endpoints
            </h3>

            <div class="space-y-3 text-xs font-mono">
              
              <!-- Authority -->
              <div class="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                <div class="min-w-0 flex-1 overflow-hidden">
                  <span class="text-slate-400 font-sans block text-[11px] mb-0.5">Authority URL (MSAL.js)</span>
                  <span class="text-slate-200 truncate block">${authorityUrl}</span>
                </div>
                <button data-copy="${authorityUrl}" class="copy-btn shrink-0 p-2 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-md transition" aria-label="Copy">${icon('clipboard', 'w-3.5 h-3.5')}</button>
              </div>

              <!-- OpenID Discovery -->
              <div class="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                <div class="min-w-0 flex-1 overflow-hidden">
                  <span class="text-slate-400 font-sans block text-[11px] mb-0.5">OIDC Discovery (.well-known)</span>
                  <span class="text-slate-200 truncate block">${discoveryUrl}</span>
                </div>
                <button data-copy="${discoveryUrl}" class="copy-btn shrink-0 p-2 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-md transition" aria-label="Copy">${icon('clipboard', 'w-3.5 h-3.5')}</button>
              </div>

              <!-- Token URL -->
              <div class="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                <div class="min-w-0 flex-1 overflow-hidden">
                  <span class="text-slate-400 font-sans block text-[11px] mb-0.5">Token Endpoint (POST)</span>
                  <span class="text-slate-200 truncate block">${tokenUrl}</span>
                </div>
                <button data-copy="${tokenUrl}" class="copy-btn shrink-0 p-2 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-md transition" aria-label="Copy">${icon('clipboard', 'w-3.5 h-3.5')}</button>
              </div>

              <!-- JWKS Keys -->
              <div class="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                <div class="min-w-0 flex-1 overflow-hidden">
                  <span class="text-slate-400 font-sans block text-[11px] mb-0.5">JWKS Public Keys (RS256)</span>
                  <span class="text-slate-200 truncate block">${jwksUrl}</span>
                </div>
                <button data-copy="${jwksUrl}" class="copy-btn shrink-0 p-2 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-md transition" aria-label="Copy">${icon('clipboard', 'w-3.5 h-3.5')}</button>
              </div>

              <!-- Logout -->
              <div class="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                <div class="min-w-0 flex-1 overflow-hidden">
                  <span class="text-slate-400 font-sans block text-[11px] mb-0.5">End Session / Logout</span>
                  <span class="text-slate-200 truncate block">${logoutUrl}</span>
                </div>
                <button data-copy="${logoutUrl}" class="copy-btn shrink-0 p-2 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-md transition" aria-label="Copy">${icon('clipboard', 'w-3.5 h-3.5')}</button>
              </div>
            </div>
          </div>

          <!-- Code Snippets Tabs -->
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
              <pre class="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto">${msalSnippet}</pre>
            </div>

            <!-- cURL Box -->
            <div id="boxCurl" class="space-y-4 hidden">
              <div>
                <div class="flex flex-wrap justify-between items-center gap-2 text-xs text-slate-400 mb-1">
                  <span>1. Exchange Authorization Code for Tokens:</span>
                  <button data-copy="${encodeURIComponent(curlCodeSnippet)}" class="copy-encoded-btn text-sky-400 hover:underline">Copy cURL</button>
                </div>
                <pre class="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-amber-300 overflow-x-auto">${curlCodeSnippet}</pre>
              </div>

              <div>
                <div class="flex flex-wrap justify-between items-center gap-2 text-xs text-slate-400 mb-1">
                  <span>2. Refresh Token Grant:</span>
                  <button data-copy="${encodeURIComponent(curlRefreshSnippet)}" class="copy-encoded-btn text-sky-400 hover:underline">Copy cURL</button>
                </div>
                <pre class="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-amber-300 overflow-x-auto">${curlRefreshSnippet}</pre>
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  `;

  // Attach Event Handlers
  document.getElementById('profileSelector')?.addEventListener('change', (e) => {
    setActiveProfileId((e.target as HTMLSelectElement).value);
    renderConfigView(container);
    showToast('Profile switched');
  });

  document.getElementById('btnNewProfile')?.addEventListener('click', () => {
    const newP: Profile = {
      id: 'profile-' + Date.now(),
      name: 'Custom Tenant Profile',
      provider: 'entra',
      tenant: 'common',
      clientId: '00000000-0000-0000-0000-000000000002',
      redirectUri: 'http://localhost:3000/callback',
      scope: 'openid profile email offline_access',
    };
    saveActiveProfile(newP);
    renderConfigView(container);
    showToast('Created new profile');
  });

  document.getElementById('btnSaveConfig')?.addEventListener('click', () => {
    const updated: Profile = {
      ...profile,
      name: (document.getElementById('inputName') as HTMLInputElement).value,
      tenant: (document.getElementById('inputTenant') as HTMLInputElement).value,
      clientId: (document.getElementById('inputClientId') as HTMLInputElement).value,
      redirectUri: (document.getElementById('inputRedirectUri') as HTMLInputElement).value,
      scope: (document.getElementById('inputScope') as HTMLInputElement).value,
    };
    saveActiveProfile(updated);
    renderConfigView(container);
    showToast('Profile saved successfully');
  });

  document.getElementById('btnDeleteProfile')?.addEventListener('click', () => {
    if (confirm('Delete this profile?')) {
      deleteProfile(profile.id);
      renderConfigView(container);
      showToast('Profile deleted');
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
