import React, { useState, useEffect, useCallback } from 'react';
import { MockUser, TokenSession, PKCEState, VerifyResponse } from '../types';
import { getActiveProject, getSession, saveSession, clearSession, savePKCEState, getPKCEState, clearPKCEState } from '../storage';
import { decodeJWT, exchangeToken, verifyIDToken, fetchMockUsers } from '../api';
import { showToast } from '../components/toast';
import { Icon } from '../components/icons';
import { highlightCode } from '../components/highlight';

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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

interface CallbackStep {
  text: string;
  done: boolean;
  active: boolean;
}

export const LoginView: React.FC = () => {
  const [project] = useState(() => getActiveProject());
  const [session, setSession] = useState<TokenSession | null>(() => getSession());
  const [mockUsers, setMockUsers] = useState<MockUser[]>([]);

  // Testing form states
  const [selectedUserEmail, setSelectedUserEmail] = useState('');
  const [testScope, setTestScope] = useState(project.scope);
  const [testPrompt, setTestPrompt] = useState('select_account');

  // Callback processing state
  const [callbackProcessing, setCallbackProcessing] = useState(false);
  const [callbackSteps, setCallbackSteps] = useState<CallbackStep[]>([
    { text: 'Authorization Code Received', done: false, active: true },
    { text: 'PKCE S256 Verifier Matched', done: false, active: false },
    { text: 'Redeeming Tokens at /oauth2/v2.0/token...', done: false, active: false },
    { text: 'Storing Session in localStorage', done: false, active: false },
  ]);

  // Verification result state
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const effectiveOrigin = (project.host && project.host.trim())
    ? project.host.trim().replace(/\/+$/, '')
    : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080');
  const tenant = project.tenant || 'common';

  // Handle Callback or Error in URL
  const processCallback = useCallback(async (code: string) => {
    setCallbackProcessing(true);

    const pkce = getPKCEState();
    const tokenTenant = pkce?.tenant || project.tenant || 'common';
    const tokenUrl = `${effectiveOrigin}/${tokenTenant}/oauth2/v2.0/token`;

    setCallbackSteps([
      { text: `Authorization Code Received (${code.substring(0, 12)}...)`, done: true, active: false },
      { text: 'PKCE S256 Verifier Matched', done: true, active: false },
      { text: 'Redeeming Tokens at /oauth2/v2.0/token...', done: false, active: true },
      { text: 'Storing Session in localStorage', done: false, active: false },
    ]);

    try {
      const redirectUri = `${window.location.origin}/callback`;
      const tokenResp = await exchangeToken(tokenUrl, {
        grant_type: 'authorization_code',
        client_id: project.clientId,
        code,
        code_verifier: pkce?.verifier || '',
        redirect_uri: redirectUri,
      });

      setCallbackSteps([
        { text: `Authorization Code Received (${code.substring(0, 12)}...)`, done: true, active: false },
        { text: 'PKCE S256 Verifier Matched', done: true, active: false },
        { text: 'RS256 ID & Access Tokens Issued', done: true, active: false },
        { text: 'Session Established in localStorage', done: true, active: false },
      ]);

      saveSession(tokenResp);
      clearPKCEState();
      setSession(tokenResp);
      showToast('Successfully authenticated! Session generated.', 'success');

      // Brief delay so user sees visual confirmation
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Token exchange failed: ${msg}`, 'error', 8000);
    } finally {
      window.history.replaceState({}, document.title, '/login');
      setCallbackProcessing(false);
    }
  }, [effectiveOrigin, project.clientId, project.tenant]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const searchPart = window.location.search || (window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '');
    const urlParams = new URLSearchParams(searchPart);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    const errorDesc = urlParams.get('error_description');

    if (error) {
      showToast(`Auth error: ${errorDesc || error}`, 'error', 6000);
      window.history.replaceState({}, document.title, '/login');
      return;
    }

    if (code) {
      void processCallback(code);
    }
  }, [processCallback]);

  // Load mock users for dropdown
  useEffect(() => {
    async function load() {
      try {
        const users = await fetchMockUsers();
        setMockUsers(users);
      } catch (err: unknown) {
        console.error('Failed to fetch mock users', err);
      }
    }
    void load();
  }, []);

  const handleStartAuth = async () => {
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
      testScope
    )}&state=${encodeURIComponent(state)}&nonce=${encodeURIComponent(
      nonce
    )}&code_challenge=${encodeURIComponent(
      challenge
    )}&code_challenge_method=S256&prompt=${encodeURIComponent(testPrompt)}`;

    if (selectedUserEmail) {
      authUrl += `&login_hint=${encodeURIComponent(selectedUserEmail)}`;
    }

    window.location.href = authUrl;
  };

  const handleVerify = async () => {
    if (!session?.id_token) return;
    setVerifying(true);
    setVerifyResult(null);
    setVerifyError(null);

    try {
      const jwksUri = `${effectiveOrigin}/${tenant}/discovery/v2.0/keys`;
      const issuer = project.issuerMode === 'entra'
        ? `https://login.microsoftonline.com/${tenant}/v2.0`
        : `${effectiveOrigin}/${tenant}/oauth2/v2.0`;
      const res = await verifyIDToken(session.id_token, jwksUri, issuer, project.clientId);
      setVerifyResult(res);
      if (res.verified) {
        showToast('Token signature is valid!');
      } else {
        showToast(`Verification notice: ${res.reason || 'Signature could not be validated'}`, 'info');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setVerifyError(msg);
      showToast(`Error: ${msg}`, 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleRefresh = async () => {
    if (!session?.refresh_token) {
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

      const updated = {
        ...session,
        ...newTokens,
      };
      saveSession(updated);
      setSession(updated);
      showToast('Token refreshed successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Refresh failed: ${msg}`, 'error');
    }
  };

  const handleSignOut = () => {
    clearSession();
    setSession(null);
    setVerifyResult(null);
    setVerifyError(null);
    showToast('Signed out of session');
  };

  const handleCopyText = (text: string, msg = 'Copied to clipboard') => {
    navigator.clipboard.writeText(text);
    showToast(msg);
  };

  // Preview Authorize URL
  let livePreviewUrl = `/${tenant}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(
    project.clientId
  )}&response_type=code&prompt=${encodeURIComponent(testPrompt)}`;
  if (selectedUserEmail) {
    livePreviewUrl += `&login_hint=${encodeURIComponent(selectedUserEmail)}`;
  }

  // 1. Rendering Callback Flow
  if (callbackProcessing) {
    return (
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="glass-panel glass-hero p-8 rounded-3xl max-w-lg w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-sky-500/20 text-sky-400 mx-auto flex items-center justify-center text-2xl shadow-lg border border-sky-500/30">
            <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Completing Single Sign-On...</h1>
            <p className="text-xs text-slate-400 mt-1">Exchanging authorization code and establishing user session.</p>
          </div>

          <div className="text-left space-y-2.5 text-xs font-mono bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
            {callbackSteps.map((step) => (
              <div
                key={step.text}
                className={`flex items-center gap-2 ${
                  step.done
                    ? 'text-emerald-400'
                    : step.active
                    ? 'text-sky-400 animate-pulse'
                    : 'text-slate-600'
                }`}
              >
                <Icon
                  name={step.done ? 'check-circle' : step.active ? 'loader' : 'circle'}
                  className={`w-3.5 h-3.5 shrink-0 ${step.active ? 'animate-spin' : ''}`}
                />
                <span>{step.text}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // 2. Rendering Empty State (No Session)
  if (!session) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Header */}
        <div className="glass-panel glass-hero p-8 rounded-3xl text-center space-y-4 max-w-3xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 mx-auto flex items-center justify-center text-3xl shadow-lg shadow-sky-500/20">
            <Icon name="rocket" className="w-7 h-7 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">OAuth2 / OIDC In-App Test Client</h1>
            <p className="text-sm text-slate-400">
              Test the local Microsoft Entra ID (PKCE S256) authorization flow directly in your browser without writing any frontend code.
            </p>
          </div>
        </div>

        {/* Testing Console Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 max-w-4xl mx-auto">
          {/* Test Parameters Form */}
          <div className="md:col-span-7 glass-panel glass-hover p-6 rounded-2xl space-y-5">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Icon name="settings" className="w-4 h-4 text-orange-400" />
              <span>Authentication Parameters</span>
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Sign in as Mock User (login_hint)
                </label>
                <select
                  value={selectedUserEmail}
                  onChange={(e) => setSelectedUserEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-sky-500 focus:outline-none cursor-pointer"
                >
                  <option value="">None (interactive picker / default)</option>
                  {mockUsers.map((u) => (
                    <option key={u.id} value={u.email}>
                      {u.name} ({u.email}) [{(u.roles || ['User']).join(', ')}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Requested OAuth Scopes</label>
                <input
                  type="text"
                  value={testScope}
                  onChange={(e) => setTestScope(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Prompt Mode (prompt)</label>
                  <select
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:outline-none cursor-pointer"
                  >
                    <option value="select_account">select_account &mdash; Account Picker</option>
                    <option value="consent">consent &mdash; Permissions & Consent</option>
                    <option value="none">none &mdash; Silent / Instant Auto-Login</option>
                    <option value="login">login &mdash; Re-authentication</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">PKCE Method</label>
                  <input
                    type="text"
                    value="S256 (SHA-256)"
                    disabled
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Live Authorize URL Preview */}
              <div className="auth-preview-card p-3 rounded-xl border space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="auth-preview-title flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider">
                    <Icon name="zap" className="w-3 h-3 text-orange-500" />
                    <span>Authorize Request Preview</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="auth-preview-tag font-mono text-[10px] font-semibold lowercase">
                      prompt={testPrompt}
                      {selectedUserEmail ? ` · ${selectedUserEmail}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(livePreviewUrl, 'Copied Authorize URL to clipboard')}
                      className="copy-claim-btn p-1 rounded transition cursor-pointer"
                      title="Copy Authorize URL"
                    >
                      <Icon name="copy" className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="auth-preview-url break-all select-all font-mono leading-relaxed text-[11px] p-2.5 rounded-lg border">
                  {livePreviewUrl}
                </div>
              </div>
            </div>

            <div className="pt-3 space-y-2">
              <button
                type="button"
                onClick={() => void handleStartAuth()}
                className="w-full py-3.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold rounded-xl transition shadow-xl shadow-sky-500/25 flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                <Icon name="zap" className="w-4 h-4" />
                <span>Launch OAuth2 + PKCE Test Flow</span>
              </button>
            </div>
          </div>

          {/* Flow Summary & Info */}
          <div className="md:col-span-5 glass-panel glass-hover p-6 rounded-2xl space-y-4 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                <Icon name="search" className="w-4 h-4 text-orange-400" />
                <span>Flow Execution Steps</span>
              </h2>
              <ol className="space-y-3 text-xs text-slate-300">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Browser generates cryptographic <strong>PKCE code_verifier</strong> and <strong>S256 challenge</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Redirects to local Entra authorize endpoint (<code className="text-sky-300 font-mono">/oauth2/v2.0/authorize</code>).
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    User identity is selected and authorization code is issued to <code className="text-sky-300 font-mono">/callback</code>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    4
                  </span>
                  <span>
                    Code + verifier exchanged at token endpoint for signed RS256 <strong>ID &amp; Access tokens</strong>.
                  </span>
                </li>
              </ol>
            </div>

            <div className="auth-authority-card p-3 rounded-xl border text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-emerald-500 font-semibold mb-0.5">
                <Icon name="check-circle" className="w-3.5 h-3.5" />
                <span>Target Authority</span>
              </span>
              <span className="auth-authority-val truncate block font-mono text-[11px] mt-0.5">
                {effectiveOrigin}/{tenant}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Active Session View
  const decodedId = session.id_token ? decodeJWT(session.id_token) : null;
  const decodedAccess = session.access_token ? decodeJWT(session.access_token) : null;

  const authBearerCurl = `curl -X GET "${effectiveOrigin}/${tenant}/oidc/userinfo" \\
  -H "Authorization: Bearer ${session.access_token}"`;

  const pictureUrl = decodedId?.payload?.picture || decodedId?.payload?.avatar_url;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Session Header Card */}
      <div className="glass-panel glass-success p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="w-14 h-14 shrink-0 rounded-2xl overflow-hidden relative shadow-lg shadow-emerald-500/20 border border-emerald-500/30 flex items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-600">
            {pictureUrl ? (
              <img
                src={pictureUrl}
                alt={decodedId?.payload?.name || 'User'}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            <div className={`w-full h-full items-center justify-center text-white ${pictureUrl ? 'hidden' : 'flex'}`}>
              <Icon name="check" className="w-7 h-7" strokeWidth={2.5} />
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-white break-words min-w-0">
                {decodedId?.payload?.name || 'Active SSO Session'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                Session Active
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5 break-all">
              {decodedId?.payload?.preferred_username || decodedId?.payload?.email || 'Authenticated User'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleVerify()}
            disabled={verifying}
            className="px-4 py-2 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-semibold rounded-xl border border-sky-500/30 transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
          >
            <Icon name={verifying ? 'loader' : 'shield'} className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
            <span>Verify JWKS Signature</span>
          </button>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Icon name="refresh" className="w-3.5 h-3.5" />
            <span>Test Token Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold rounded-xl border border-rose-500/30 transition cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Verification Result Alert */}
      {verifying && (
        <div className="p-4 rounded-xl border bg-sky-950/60 border-sky-500/40 text-sky-200 text-xs font-mono block">
          Verifying ID Token signature against local JWKS...
        </div>
      )}
      {verifyResult && (
        <div
          className={`p-4 rounded-xl border text-xs font-mono block ${
            verifyResult.verified
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
          }`}
        >
          {verifyResult.verified ? (
            <span>
              RS256 JWKS signature verified successfully! Key ID: local-sso-key-1, Issuer:{' '}
              {verifyResult.claims?.iss || `${effectiveOrigin}/${tenant}/oauth2/v2.0`}, Subject:{' '}
              {verifyResult.claims?.sub}
            </span>
          ) : (
            <span>Verification Notice: {verifyResult.reason || 'Signature could not be validated'}</span>
          )}
        </div>
      )}
      {verifyError && (
        <div className="p-4 rounded-xl border bg-rose-950/60 border-rose-500/40 text-rose-200 text-xs font-mono block">
          Error: {verifyError}
        </div>
      )}

      {/* User Identity Breakdown */}
      <div className="tilt-card glass-panel glass-hover p-6 rounded-2xl space-y-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Icon name="user" className="w-4 h-4 text-orange-400" />
          <span>Authenticated Identity Profile (from ID Token)</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-900">
            <span className="text-slate-500 block text-[10px] mb-0.5">Display Name</span>
            <span className="text-slate-200 font-semibold truncate block">
              {decodedId?.payload?.name || 'N/A'}
            </span>
          </div>
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-900">
            <span className="text-slate-500 block text-[10px] mb-0.5">Email / Username</span>
            <span className="text-slate-200 font-semibold truncate block">
              {decodedId?.payload?.preferred_username || decodedId?.payload?.email || 'N/A'}
            </span>
          </div>
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-900">
            <span className="text-slate-500 block text-[10px] mb-0.5">Tenant GUID (tid)</span>
            <span className="text-slate-200 font-semibold truncate block">
              {decodedId?.payload?.tid || 'N/A'}
            </span>
          </div>
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-900">
            <span className="text-slate-500 block text-[10px] mb-0.5">Directory Roles</span>
            <span className="text-sky-400 font-semibold truncate block">
              {(decodedId?.payload?.roles || ['User']).join(', ')}
            </span>
          </div>
        </div>
      </div>

      {/* Main Token Inspector Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ID Token */}
        <div className="glass-panel glass-hover p-6 rounded-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Icon name="id-card" className="w-4 h-4 text-orange-400" />
              <span>ID Token (OIDC Claims)</span>
            </h2>
            <button
              type="button"
              onClick={() => handleCopyText(session.id_token, 'Copied ID token to clipboard')}
              className="text-xs text-sky-400 hover:underline cursor-pointer"
            >
              Copy Raw JWT
            </button>
          </div>

          {decodedId ? (
            <div className="space-y-3">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 block mb-1">JOSE Header (RS256):</span>
                <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono overflow-x-auto">
                  <code
                    className="language-json"
                    dangerouslySetInnerHTML={{
                      __html: highlightCode(JSON.stringify(decodedId.header, null, 2), 'json'),
                    }}
                  />
                </pre>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-400 block mb-1">Payload (Entra v2.0 Claims):</span>
                <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono overflow-x-auto max-h-96">
                  <code
                    className="language-json"
                    dangerouslySetInnerHTML={{
                      __html: highlightCode(JSON.stringify(decodedId.payload, null, 2), 'json'),
                    }}
                  />
                </pre>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">No ID Token available.</div>
          )}
        </div>

        {/* Access Token & Session Details */}
        <div className="glass-panel glass-hover p-6 rounded-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Icon name="key" className="w-4 h-4 text-orange-400" />
              <span>Access Token &amp; Refresh Token</span>
            </h2>
            <button
              type="button"
              onClick={() => handleCopyText(session.access_token, 'Copied Access token to clipboard')}
              className="text-xs text-sky-400 hover:underline cursor-pointer"
            >
              Copy Access Token
            </button>
          </div>

          {decodedAccess ? (
            <div className="space-y-3">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Access Token Claims (scp &amp; appid):
                </span>
                <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono overflow-x-auto">
                  <code
                    className="language-json"
                    dangerouslySetInnerHTML={{
                      __html: highlightCode(JSON.stringify(decodedAccess.payload, null, 2), 'json'),
                    }}
                  />
                </pre>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-400 block mb-1">Refresh Token:</span>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono text-slate-400 break-all select-all">
                  {session.refresh_token || 'None issued'}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Test with cURL (Bearer Authorization):
                </span>
                <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono overflow-x-auto">
                  <code
                    className="language-bash"
                    dangerouslySetInnerHTML={{ __html: highlightCode(authBearerCurl, 'bash') }}
                  />
                </pre>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">No Access Token available.</div>
          )}
        </div>
      </div>
    </div>
  );
};
