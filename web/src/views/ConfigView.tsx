import React, { useState } from 'react';
import { Profile } from '../types';
import { getActiveProject, getProjects, saveActiveProject, setActiveProjectId, deleteProject } from '../storage';
import { showToast } from '../components/toast';
import { Icon } from '../components/icons';
import { CodeBlock } from '../components/CodeBlock';
import { SwaggerApiExplorer } from '../components/SwaggerApiExplorer';

type ConfigTab = 'settings' | 'endpoints';
type SnippetTab = 'msal' | 'curl';

export const ConfigView: React.FC = () => {
  const [project, setProject] = useState<Profile>(() => getActiveProject());
  const [projects, setProjects] = useState<Profile[]>(() => getProjects());
  const [activeTab, setActiveTab] = useState<ConfigTab>('settings');
  const [snippetTab, setSnippetTab] = useState<SnippetTab>('msal');
  const [showSecret, setShowSecret] = useState(false);
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});

  // Form states
  const [name, setName] = useState(project.name);
  const [rootUrl, setRootUrl] = useState(project.rootUrl || '');
  const [tenant, setTenant] = useState(project.tenant || 'common');
  const [clientId, setClientId] = useState(project.clientId);
  const [clientSecret, setClientSecret] = useState(project.clientSecret || '');
  const [redirectUri, setRedirectUri] = useState(project.redirectUri);
  const [host, setHost] = useState(project.host || '');
  const [issuerMode, setIssuerMode] = useState<'host' | 'entra'>(project.issuerMode || 'host');
  const [scope, setScope] = useState(project.scope);

  const syncForm = (p: Profile) => {
    setName(p.name);
    setRootUrl(p.rootUrl || '');
    setTenant(p.tenant || 'common');
    setClientId(p.clientId);
    setClientSecret(p.clientSecret || '');
    setRedirectUri(p.redirectUri);
    setHost(p.host || '');
    setIssuerMode(p.issuerMode || 'host');
    setScope(p.scope);
  };

  const handleProjectSelect = (id: string) => {
    setActiveProjectId(id);
    const found = getProjects().find((p) => p.id === id);
    if (found) {
      setProject(found);
      syncForm(found);
      showToast('Project switched');
    }
  };

  const handleNewProject = () => {
    const newP: Profile = {
      id: 'project-' + Date.now(),
      name: 'Custom Project',
      rootUrl: 'http://localhost:3000',
      provider: 'entra',
      tenant: 'common',
      clientId: '00000000-0000-0000-0000-000000000002',
      clientSecret: 'local-sso-secret-' + Math.random().toString(36).slice(2, 10),
      redirectUri: 'http://localhost:3000/callback',
      scope: 'openid profile email offline_access',
      host: '',
      issuerMode: 'host',
    };
    saveActiveProject(newP);
    setProjects(getProjects());
    setProject(newP);
    syncForm(newP);
    setActiveTab('settings');
    showToast('Created new project');
  };

  const handleSaveChanges = () => {
    const updated: Profile = {
      ...project,
      name,
      rootUrl: rootUrl.trim(),
      tenant,
      clientId,
      clientSecret,
      redirectUri,
      scope,
      host: host.trim(),
      issuerMode,
    };
    saveActiveProject(updated);
    setProject(updated);
    setProjects(getProjects());
    showToast('Project saved successfully');
  };

  const handleDeleteProject = () => {
    if (window.confirm('Delete this project?')) {
      deleteProject(project.id);
      const remaining = getProjects();
      setProjects(remaining);
      const active = getActiveProject();
      setProject(active);
      syncForm(active);
      showToast('Project deleted');
    }
  };

  const handleCopy = (key: string, text: string, toastMessage = 'Copied to clipboard!') => {
    navigator.clipboard.writeText(text);
    setCopiedMap((prev) => ({ ...prev, [key]: true }));
    showToast(toastMessage);
    setTimeout(() => {
      setCopiedMap((prev) => ({ ...prev, [key]: false }));
    }, 1600);
  };

  // Derived URLs & endpoints
  const effectiveOrigin = (host && host.trim())
    ? host.trim().replace(/\/+$/, '')
    : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080');

  const currentTenant = tenant || 'common';
  const issuerUrl = issuerMode === 'entra'
    ? `https://login.microsoftonline.com/${currentTenant}/v2.0`
    : `${effectiveOrigin}/${currentTenant}/oauth2/v2.0`;

  const authorityUrl = `${effectiveOrigin}/${currentTenant}`;
  const discoveryUrl = `${effectiveOrigin}/${currentTenant}/oauth2/v2.0/.well-known/openid-configuration`;
  const authorizeBaseUrl = `${effectiveOrigin}/${currentTenant}/oauth2/v2.0/authorize`;
  const authorizeUrl = `${authorizeBaseUrl}?client_id=${encodeURIComponent(
    clientId
  )}&response_type=code&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_mode=query&scope=${encodeURIComponent(
    scope
  )}&state=12345&nonce=67890`;
  const tokenUrl = `${effectiveOrigin}/${currentTenant}/oauth2/v2.0/token`;
  const jwksUrl = `${effectiveOrigin}/${currentTenant}/discovery/v2.0/keys`;
  const logoutUrl = `${effectiveOrigin}/${currentTenant}/oauth2/v2.0/logout`;
  const userinfoUrl = `${effectiveOrigin}/${currentTenant}/oidc/userinfo`;
  const tokenProxyUrl = `${effectiveOrigin}/api/token`;
  const verifyApiUrl = `${effectiveOrigin}/api/verify`;
  const usersApiUrl = `${effectiveOrigin}/api/users`;

  let knownHost = 'localhost:8080';
  try {
    knownHost = new URL(effectiveOrigin).host;
  } catch {}

  const msalSnippet = `// @azure/msal-browser / React MSAL configuration for local dev
import { PublicClientApplication } from "@azure/msal-browser";

export const msalConfig = {
  auth: {
    clientId: "${clientId}",
    authority: "${authorityUrl}",
    knownAuthorities: ["${knownHost}"],
    redirectUri: "${redirectUri}",
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  }
};

export const msalInstance = new PublicClientApplication(msalConfig);`;

  const curlCodeSnippet = `curl -X POST "${tokenUrl}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "client_id=${clientId}" \\
  -d "client_secret=${clientSecret}" \\
  -d "grant_type=authorization_code" \\
  -d "code=AUTHORIZATION_CODE" \\
  -d "code_verifier=PKCE_CODE_VERIFIER" \\
  -d "redirect_uri=${redirectUri}"`;

  const curlRefreshSnippet = `curl -X POST "${tokenUrl}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "client_id=${clientId}" \\
  -d "client_secret=${clientSecret}" \\
  -d "grant_type=refresh_token" \\
  -d "refresh_token=REFRESH_TOKEN" \\
  -d "scope=${scope}"`;



  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner / Project Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-6 rounded-2xl">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">SSO Configuration</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">
              Active
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Project: <span className="text-white font-medium">{project.name}</span> &mdash;{' '}
            <span className="font-mono text-xs">{project.rootUrl || '—'}</span>
          </p>
          <p className="text-sm text-slate-400 mt-0.5">
            Configure your local Microsoft Entra ID tenant parameters and copy endpoints for your frontend application.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select
            value={project.id}
            onChange={(e) => handleProjectSelect(e.target.value)}
            className="flex-1 min-w-0 md:flex-none md:w-auto bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-sky-500 focus:outline-none cursor-pointer"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.rootUrl})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleNewProject}
            className="shrink-0 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
            aria-label="New project"
          >
            <Icon name="plus" className="w-3.5 h-3.5" strokeWidth={2.25} />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 glass-panel rounded-2xl w-full sm:w-auto sm:inline-flex">
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10'
              : 'text-slate-400 hover:text-white border border-transparent hover:bg-white/5'
          }`}
        >
          <Icon name="settings" className="w-4 h-4" />
          <span>Project Settings</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('endpoints')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${
            activeTab === 'endpoints'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10'
              : 'text-slate-400 hover:text-white border border-transparent hover:bg-white/5'
          }`}
        >
          <Icon name="globe" className="w-4 h-4" />
          <span>Swagger &amp; APIs</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'endpoints' ? 'bg-sky-500/25 text-sky-200' : 'bg-slate-800 text-slate-400'
            }`}
          >
            OAS 3.0
          </span>
        </button>
      </div>

      {/* Settings Panel */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Quick Frontend Redirect URL Card */}
          <div className="tilt-card glass-panel glass-hero p-6 rounded-2xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400 shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-white">Frontend Redirect Authorize URL</h2>
                  <p className="text-xs text-slate-400">
                    Direct your frontend login button/session generator to this URL to trigger Microsoft Entra auth flow
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy('auth-banner-url', authorizeUrl, 'Copied full Authorize URL to clipboard!')}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold rounded-lg shadow-md shadow-sky-500/20 transition flex items-center gap-2 cursor-pointer"
                >
                  <Icon name={copiedMap['auth-banner-url'] ? 'check' : 'copy'} className="w-4 h-4" />
                  <span>{copiedMap['auth-banner-url'] ? 'Copied!' : 'Copy Authorize URL'}</span>
                </button>
                <a
                  href={authorizeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center gap-1"
                >
                  Test Launch <Icon name="arrow-up-right" className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="auth-preview-url p-3 rounded-xl border font-mono text-xs break-all select-all leading-relaxed">
              {authorizeUrl}
            </div>
          </div>

          {/* Main Config Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            {/* Left: Configuration Form */}
            <div className="lg:col-span-5 space-y-6">
              <div className="glass-panel glass-hover p-6 rounded-2xl space-y-5">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Icon name="settings" className="w-4 h-4 text-orange-400" />
                  <span>Project SSO Settings</span>
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Project Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Project Root URL</label>
                    <input
                      type="text"
                      value={rootUrl}
                      onChange={(e) => setRootUrl(e.target.value)}
                      placeholder="e.g. http://localhost:3000"
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Root URL of your frontend application. Used to build authorization links for this project.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Tenant (Alias or GUID){' '}
                      <span className="text-[10px] text-slate-500 font-normal">
                        (&quot;common&quot;, &quot;organizations&quot;, &quot;consumers&quot;, or tenant GUID)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={tenant}
                      onChange={(e) => setTenant(e.target.value)}
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Application (Client) ID</label>
                    <input
                      type="text"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5">
                      <Icon name="lock" className="w-3 h-3 text-amber-400" /> Client Secret{' '}
                      <span className="text-[10px] text-slate-500 font-normal">(shown in token requests, like Microsoft Entra)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder="e.g. local-sso-secret-..."
                        autoComplete="off"
                        spellCheck="false"
                        className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-3.5 pr-20 py-2 text-sm font-mono text-white placeholder-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                      />
                      <div className="absolute inset-y-0 right-1.5 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setShowSecret(!showSecret)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                          aria-label="Toggle secret visibility"
                          title="Show / hide secret"
                        >
                          <Icon name="key" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy('form-secret', clientSecret, 'Copied client secret to clipboard!')}
                          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                          aria-label="Copy secret"
                          title="Copy secret"
                        >
                          <Icon
                            name={copiedMap['form-secret'] ? 'check' : 'copy'}
                            className={`w-3.5 h-3.5 ${copiedMap['form-secret'] ? 'text-emerald-400' : ''}`}
                          />
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Client secret is echoed in token curl snippets and responses. Mock servers accept any value.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Redirect URI (Frontend Callback)</label>
                    <input
                      type="text"
                      value={redirectUri}
                      onChange={(e) => setRedirectUri(e.target.value)}
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                      <span>Host Origin / Base URL</span>
                      <span className="text-[10px] text-sky-400 font-normal">Active: {effectiveOrigin}</span>
                    </label>
                    <input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder={`e.g. https://xxxx.ngrok-free.app or ${effectiveOrigin}`}
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white placeholder-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Base host origin for endpoints &amp; snippets. Configure with your ngrok HTTPS URL when exposing externally.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                      <span>OIDC Issuer Format</span>
                      <span className="text-[10px] text-slate-500 font-normal font-mono truncate max-w-[200px]">{issuerUrl}</span>
                    </label>
                    <select
                      value={issuerMode}
                      onChange={(e) => setIssuerMode(e.target.value as 'host' | 'entra')}
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none cursor-pointer"
                    >
                      <option value="host">Host Origin ({effectiveOrigin}/{currentTenant}/oauth2/v2.0) [Recommended]</option>
                      <option value="entra">Microsoft Entra ID (https://login.microsoftonline.com/{currentTenant}/v2.0)</option>
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Specifies the <code className="text-slate-400">iss</code> claim in ID tokens and discovery document.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">OAuth Scopes</label>
                    <input
                      type="text"
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-sky-600/20 cursor-pointer"
                  >
                    Save Changes
                  </button>
                  {projects.length > 1 && (
                    <button
                      type="button"
                      onClick={handleDeleteProject}
                      className="px-3.5 py-2 text-rose-400 hover:text-rose-300 text-xs font-medium hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                    >
                      Delete Project
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Integration Snippets */}
            <div className="lg:col-span-7 space-y-6">
              <div className="glass-panel glass-hover p-6 rounded-2xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Icon name="terminal" className="w-4 h-4 text-orange-400" />
                    <span>Frontend &amp; CLI Integration Snippets</span>
                  </h3>
                  <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setSnippetTab('msal')}
                      className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition ${
                        snippetTab === 'msal' ? 'bg-sky-500/20 text-sky-400' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      MSAL.js
                    </button>
                    <button
                      type="button"
                      onClick={() => setSnippetTab('curl')}
                      className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition ${
                        snippetTab === 'curl' ? 'bg-sky-500/20 text-sky-400' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      cURL
                    </button>
                  </div>
                </div>

                {snippetTab === 'msal' && (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400">Configure your frontend @azure/msal-browser instance:</div>
                    <CodeBlock code={msalSnippet} lang="typescript" showWindowButtons={false} />
                  </div>
                )}

                {snippetTab === 'curl' && (
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">1. Exchange Authorization Code for Tokens:</div>
                      <CodeBlock code={curlCodeSnippet} lang="bash" showWindowButtons={false} />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">2. Refresh Token Grant:</div>
                      <CodeBlock code={curlRefreshSnippet} lang="bash" showWindowButtons={false} />
                    </div>
                  </div>
                )}
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-slate-800/80">
                <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                  <Icon name="info" className="w-4 h-4 text-sky-400" />
                  <span>Using these settings</span>
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Copy the Client ID and Client Secret above into your OAuth client. Then open the{' '}
                  <button
                    type="button"
                    onClick={() => setActiveTab('endpoints')}
                    className="text-sky-400 hover:text-sky-300 font-semibold underline underline-offset-2 cursor-pointer"
                  >
                    Endpoints &amp; APIs
                  </button>{' '}
                  tab to copy ready-to-use authorize, token, JWKS, and discovery URLs.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Swagger OpenAPI & Endpoints Panel */}
      {activeTab === 'endpoints' && (
        <SwaggerApiExplorer
          effectiveOrigin={effectiveOrigin}
          currentTenant={currentTenant}
          clientId={clientId}
          clientSecret={clientSecret}
          redirectUri={redirectUri}
          scope={scope}
          rootUrl={rootUrl}
          issuerUrl={issuerUrl}
          authorityUrl={authorityUrl}
          discoveryUrl={discoveryUrl}
          authorizeBaseUrl={authorizeBaseUrl}
          tokenUrl={tokenUrl}
          jwksUrl={jwksUrl}
          logoutUrl={logoutUrl}
          userinfoUrl={userinfoUrl}
          tokenProxyUrl={tokenProxyUrl}
          verifyApiUrl={verifyApiUrl}
          usersApiUrl={usersApiUrl}
        />
      )}
    </div>
  );
};
