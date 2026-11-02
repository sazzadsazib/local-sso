import React, { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Profile } from '../types';
import { getActiveProject, getProjects, setActiveProjectId } from '../storage';
import { Icon } from '../components/icons';
import { CodeBlock } from '../components/CodeBlock';
import { showToast } from '../components/toast';

type ExampleTab = 'curl' | 'mw' | 'better-auth' | 'msal' | 'nextauth';
type MwSubTab = 'nextjs-middleware' | 'nextjs-route' | 'express';

export const ExamplesView: React.FC = () => {
  const [project, setProject] = useState<Profile>(() => getActiveProject());
  const [projects] = useState<Profile[]>(() => getProjects());
  const [activeTab, setActiveTab] = useState<ExampleTab>('curl');
  const [mwSubTab, setMwSubTab] = useState<MwSubTab>('nextjs-middleware');

  const handleProjectSelect = (id: string) => {
    setActiveProjectId(id);
    const found = projects.find((p) => p.id === id);
    if (found) {
      setProject(found);
      showToast('Switched project context');
    }
  };

  const effectiveOrigin = (project.host && project.host.trim())
    ? project.host.trim().replace(/\/+$/, '')
    : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080');

  const tenant = project.tenant || 'common';
  const issuerMode = project.issuerMode || 'host';
  const issuerUrl = issuerMode === 'entra'
    ? `https://login.microsoftonline.com/${tenant}/v2.0`
    : `${effectiveOrigin}/${tenant}/oauth2/v2.0`;

  const authorityUrl = `${effectiveOrigin}/${tenant}`;
  const discoveryUrl = `${effectiveOrigin}/${tenant}/oauth2/v2.0/.well-known/openid-configuration`;
  const authorizeBaseUrl = `${effectiveOrigin}/${tenant}/oauth2/v2.0/authorize`;
  const tokenUrl = `${effectiveOrigin}/${tenant}/oauth2/v2.0/token`;
  const jwksUrl = `${effectiveOrigin}/${tenant}/discovery/v2.0/keys`;
  const userinfoUrl = `${effectiveOrigin}/${tenant}/oidc/userinfo`;
  const verifyApiUrl = `${effectiveOrigin}/api/verify`;

  let knownHost = 'localhost:8080';
  try {
    knownHost = new URL(effectiveOrigin).host;
  } catch {}

  // 1. cURL snippets
  const curlDiscoverySnippet = `curl -s "${discoveryUrl}" | jq .`;

  const curlPkceSnippet = `# 1. Generate a PKCE Code Verifier (random string, 43-128 chars)
VERIFIER="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

# 2. Compute SHA-256 Base64URL-encoded challenge
CHALLENGE="E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

# 3. Direct user / browser to the Authorize URL with PKCE:
${authorizeBaseUrl}?client_id=${encodeURIComponent(project.clientId)}&response_type=code&redirect_uri=${encodeURIComponent(project.redirectUri)}&scope=${encodeURIComponent(project.scope)}&code_challenge=$CHALLENGE&code_challenge_method=S256&response_mode=query&state=xyz123`;

  const curlTokenSnippet = `curl -X POST "${tokenUrl}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=authorization_code" \\
  -d "client_id=${project.clientId}" \\
  -d "code=MOCK_AUTH_CODE_FROM_REDIRECT" \\
  -d "code_verifier=$VERIFIER" \\
  -d "redirect_uri=${project.redirectUri}"`;

  const curlUserInfoSnippet = `curl -X GET "${userinfoUrl}" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`;

  const curlRefreshSnippet = `curl -X POST "${tokenUrl}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=refresh_token" \\
  -d "client_id=${project.clientId}" \\
  -d "refresh_token=YOUR_REFRESH_TOKEN" \\
  -d "scope=${project.scope}"`;

  const curlVerifySnippet = `curl -X POST "${verifyApiUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"token": "YOUR_JWT_ACCESS_OR_ID_TOKEN"}'`;

  // 2. Middleware snippets
  const nextjsMiddlewareCode = `// middleware.ts (Next.js App Router / Pages Router Edge Middleware)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, createRemoteJWKSet } from 'jose';

// Cache remote JWKS public key set pointing to local-sso keys endpoint
const JWKS = createRemoteJWKSet(new URL('${jwksUrl}'));

export async function middleware(request: NextRequest) {
  // 1. Extract Bearer token from Authorization header or session cookie
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : request.cookies.get('sso_access_token')?.value;

  // 2. If token is missing, redirect browser or return 401 for API routes
  if (!token) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }

    const loginUrl = new URL('${authorizeBaseUrl}');
    loginUrl.searchParams.set('client_id', '${project.clientId}');
    loginUrl.searchParams.set('response_type', 'code');
    loginUrl.searchParams.set('redirect_uri', '${project.redirectUri}');
    loginUrl.searchParams.set('scope', '${project.scope}');
    loginUrl.searchParams.set('state', request.nextUrl.pathname); // returnTo state

    return NextResponse.redirect(loginUrl);
  }

  // 3. Cryptographically verify RS256 signature against local-sso JWKS
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: '${issuerUrl}',
      audience: '${project.clientId}',
    });

    // 4. Forward verified user claims to Server Components & Route Handlers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', (payload.sub || payload.oid) as string);
    requestHeaders.set('x-user-email', (payload.preferred_username || payload.email || '') as string);
    requestHeaders.set('x-user-name', (payload.name || '') as string);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (err) {
    console.error('Middleware token verification failed:', err);
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('${authorizeBaseUrl}', request.url));
  }
}

// Routes protected by this middleware
export const config = {
  matcher: ['/dashboard/:path*', '/api/protected/:path*'],
};`;

  const nextjsRouteHandlerCode = `// app/api/auth/callback/route.ts (Next.js App Router Auth Callback)
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.json(
      { error: error || 'Missing authorization code' },
      { status: 400 }
    );
  }

  // 1. Redeem authorization code for tokens directly on server
  const tokenResponse = await fetch('${tokenUrl}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: '${project.clientId}',
      code,
      redirect_uri: '${project.redirectUri}',
    }),
  });

  if (!tokenResponse.ok) {
    const errBody = await tokenResponse.text();
    return NextResponse.json({ error: 'Token exchange failed', details: errBody }, { status: 500 });
  }

  const tokens = await tokenResponse.json();

  // 2. Set HTTP-only secure cookie and redirect user to dashboard
  const response = NextResponse.redirect(new URL('/dashboard', request.url));
  response.cookies.set('sso_access_token', tokens.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: tokens.expires_in || 3600,
  });

  return response;
}`;

  const expressMiddlewareCode = `// authMiddleware.ts (Express / Node.js API Middleware)
import { Request, Response, NextFunction } from 'express';
import { expressjwt, GetVerificationKey } from 'express-jwt';
import jwksRsa from 'jwks-rsa';

export interface AuthenticatedRequest extends Request {
  auth?: {
    sub?: string;
    email?: string;
    name?: string;
    roles?: string[];
    [key: string]: unknown;
  };
}

// Automatically fetches and caches public signing keys from local-sso JWKS
const secretCallback: GetVerificationKey = jwksRsa.expressJwtSecret({
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 60,
  jwksUri: '${jwksUrl}',
}) as GetVerificationKey;

// Middleware to validate Bearer tokens on protected Express routes
export const requireAuth = expressjwt({
  secret: secretCallback,
  audience: '${project.clientId}',
  issuer: '${issuerUrl}',
  algorithms: ['RS256'],
});

// Custom error handler for clean 401 responses
export function authErrorHandler(err: Error & { name?: string }, req: Request, res: Response, next: NextFunction) {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'unauthorized',
      message: err.message,
      hint: 'Ensure Bearer token is issued by local-sso and not expired.',
    });
  }
  next(err);
}`;

  // 3. Better Auth snippets
  const betterAuthEnv = `# .env.local (Better Auth Environment Configuration)
BETTER_AUTH_SECRET=local_dev_secret_must_be_at_least_32_characters_long
BETTER_AUTH_URL=http://localhost:3000

# Local SSO Configuration
LOCAL_SSO_ISSUER=${issuerUrl}
LOCAL_SSO_CLIENT_ID=${project.clientId}
LOCAL_SSO_CLIENT_SECRET=mock_client_secret_optional
LOCAL_SSO_DISCOVERY_URL=${discoveryUrl}`;

  const betterAuthServerCode = `// lib/auth.ts (Better Auth Server Instance with @better-auth/sso plugin)
import { betterAuth } from "better-auth";
import { sso } from "@better-auth/sso";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET || "local_dev_secret_32_characters_long",
  plugins: [
    sso(), // Enables Enterprise / OIDC Single Sign-On
  ],
});`;

  const betterAuthClientCode = `// lib/auth-client.ts (Frontend Client with SSO Client Plugin)
import { createAuthClient } from "better-auth/react";
import { ssoClient } from "@better-auth/sso/client";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  plugins: [ssoClient()],
});`;

  const betterAuthRegisterAndLoginCode = `// components/sso-login.tsx (Register Local SSO Provider & Sign In)
"use client";

import { authClient } from "@/lib/auth-client";
import { useState } from "react";

export function SSOLoginButton() {
  const [loading, setLoading] = useState(false);

  // 1. One-time registration of local-sso as an enterprise OIDC provider:
  const setupAndLogin = async () => {
    setLoading(true);
    try {
      // Better Auth auto-fetches OIDC discovery via the issuer URL:
      // ${discoveryUrl}
      await authClient.sso.register({
        providerId: "local-sso",
        issuer: "${issuerUrl}",
        domain: "localhost", // Match domain or email e.g. "company.com"
        oidcConfig: {
          clientId: "${project.clientId}",
          clientSecret: "mock_client_secret",
          scopes: ["openid", "profile", "email", "offline_access"],
          pkce: true,
        },
      });

      // 2. Trigger SSO Redirect Sign-In:
      await authClient.signIn.sso({
        providerId: "local-sso",
        callbackURL: "/dashboard",
      });
    } catch (err) {
      console.error("SSO sign-in error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={setupAndLogin}
      disabled={loading}
      className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-xl transition cursor-pointer"
    >
      {loading ? "Redirecting to Local SSO..." : "Sign in with Better Auth SSO"}
    </button>
  );
}`;

  const betterAuthRouteHandlerCode = `// app/api/auth/[...all]/route.ts (Next.js App Router Route Handler)
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);`;

  // 4. Azure MSAL snippets
  const msalConfigCode = `// authConfig.ts (Azure MSAL Browser Configuration)
import { Configuration, LogLevel } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: "${project.clientId}",
    // Authority URL pointing to local-sso tenant:
    authority: "${authorityUrl}",
    // CRITICAL FOR LOCAL DEV: knownAuthorities tells MSAL to trust your local host origin
    // without rejecting non-Microsoft domains as untrusted!
    knownAuthorities: ["${knownHost}"],
    redirectUri: "${project.redirectUri}",
    postLogoutRedirectUri: "${project.rootUrl || 'http://localhost:3000'}",
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: "localStorage", // or "sessionStorage"
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: (level, message) => {
        if (level === LogLevel.Error) console.error(message);
      },
    },
  },
};

// Scopes to request during sign-in
export const loginRequest = {
  scopes: ["openid", "profile", "email", "offline_access"],
};`;

  const msalReactCode = `// App.tsx / main.tsx (React MSAL Provider & Hooks Integration)
import React from "react";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider, useMsal, AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";
import { msalConfig, loginRequest } from "./authConfig";

const msalInstance = new PublicClientApplication(msalConfig);

export function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <div className="p-8">
        <AuthenticatedTemplate>
          <UserProfile />
        </AuthenticatedTemplate>
        <UnauthenticatedTemplate>
          <LoginButton />
        </UnauthenticatedTemplate>
      </div>
    </MsalProvider>
  );
}

function LoginButton() {
  const { instance } = useMsal();

  const handleLogin = () => {
    // Redirects browser to local-sso authorization screen with PKCE
    instance.loginRedirect(loginRequest);
  };

  return (
    <button onClick={handleLogin} className="px-5 py-2.5 bg-orange-600 text-white font-semibold rounded-xl cursor-pointer">
      Sign in with Local Microsoft Entra
    </button>
  );
}

function UserProfile() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];

  const handleLogout = () => {
    instance.logoutRedirect();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Welcome, {account?.name}</h2>
      <p className="text-sm font-mono text-slate-400">Email: {account?.username}</p>
      <button onClick={handleLogout} className="px-4 py-2 bg-slate-800 text-slate-200 rounded-lg cursor-pointer">
        Sign Out
      </button>
    </div>
  );
}`;

  const msalNodeCode = `// backend-msal.ts (@azure/msal-node for Server-to-Server or SSR)
import { ConfidentialClientApplication, Configuration } from "@azure/msal-node";

const msalNodeConfig: Configuration = {
  auth: {
    clientId: "${project.clientId}",
    authority: "${authorityUrl}",
    knownAuthorities: ["${knownHost}"],
    clientSecret: "mock_client_secret_optional",
  },
};

export const cca = new ConfidentialClientApplication(msalNodeConfig);

// Exchanging authorization code on server
export async function acquireTokenWithCode(code: string, codeVerifier: string) {
  const response = await cca.acquireTokenByCode({
    code,
    codeVerifier,
    redirectUri: "${project.redirectUri}",
    scopes: ["openid", "profile", "email"],
  });
  return response;
}`;

  // 5. NextAuth snippets
  const nextAuthConfigCode = `// auth.ts (NextAuth.js v5 / Auth.js)
import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID || "${project.clientId}",
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET || "mock_secret",
      tenantId: "${tenant}",
      issuer: "${issuerUrl}",
      wellKnown: "${discoveryUrl}",
      authorization: {
        url: "${authorizeBaseUrl}",
        params: {
          scope: "${project.scope}",
          response_type: "code",
        },
      },
      token: "${tokenUrl}",
      userinfo: "${userinfoUrl}",
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      return session;
    },
  },
});`;

  const nextAuthEnv = `# .env.local (NextAuth.js v5 Environment Configuration)
AUTH_SECRET=local_dev_secret_must_be_32_characters
NEXTAUTH_URL=http://localhost:3000

# Microsoft Entra ID Provider Credentials
AUTH_MICROSOFT_ENTRA_ID_ID=${project.clientId}
AUTH_MICROSOFT_ENTRA_ID_SECRET=mock_secret
AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=${tenant}
AUTH_MICROSOFT_ENTRA_ID_ISSUER=${issuerUrl}`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner & Project Selector */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center gap-1.5">
                <Icon name="code" className="w-3.5 h-3.5" />
                <span>Integration Blueprints</span>
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-white/5 text-slate-400 border border-white/10">
                {issuerMode === 'entra' ? 'Issuer: login.microsoftonline.com' : 'Issuer: localhost'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              SSO Integration Guides &amp; Examples
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
              Step-by-step code snippets, environment templates, and route middleware tailored to your active local-sso project. Select a framework below to configure your application in seconds.
            </p>
          </div>

          {/* Project Selector & Quick Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-2.5 flex flex-col gap-1.5 shadow-lg">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                Active Project Context
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={project.id}
                  onChange={(e) => handleProjectSelect(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-xl px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:outline-none cursor-pointer"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.tenant})
                    </option>
                  ))}
                </select>
                <Link
                  to="/config"
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Icon name="settings" className="w-3.5 h-3.5 text-orange-400" />
                  <span>Config</span>
                </Link>
              </div>
            </div>

            <Link
              to="/login"
              className="px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold rounded-2xl shadow-lg shadow-orange-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Icon name="rocket" className="w-4 h-4" />
              <span>Test Client</span>
            </Link>
          </div>
        </div>

        {/* Dynamic Parameter Badge Ribbon */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span className="text-slate-500 text-[10px] block uppercase">Tenant</span>
            <span className="text-slate-200 truncate block font-semibold">{tenant}</span>
          </div>
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span className="text-slate-500 text-[10px] block uppercase">Client ID</span>
            <span className="text-slate-200 truncate block font-semibold">{project.clientId}</span>
          </div>
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span className="text-slate-500 text-[10px] block uppercase">Redirect URI</span>
            <span className="text-slate-200 truncate block font-semibold">{project.redirectUri}</span>
          </div>
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span className="text-slate-500 text-[10px] block uppercase">Local SSO Origin</span>
            <span className="text-orange-400 truncate block font-semibold">{effectiveOrigin}</span>
          </div>
        </div>
      </div>

      {/* Main Technology Tabs Navigation Bar */}
      <div className="glass-panel p-2 rounded-2xl flex flex-wrap items-center gap-1.5 border border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('curl')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'curl'
              ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Icon name="terminal" className="w-4 h-4" />
          <span>API &amp; cURL</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('mw')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'mw'
              ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Icon name="shield" className="w-4 h-4" />
          <span>Route &amp; API Middleware</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('better-auth')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'better-auth'
              ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Icon name="zap" className="w-4 h-4" />
          <span>Better Auth SSO</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('msal')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'msal'
              ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Icon name="globe" className="w-4 h-4" />
          <span>Azure MSAL</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('nextauth')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'nextauth'
              ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Icon name="lock" className="w-4 h-4" />
          <span>NextAuth / Auth.js</span>
        </button>
      </div>

      {/* TAB 1: cURL */}
      {activeTab === 'curl' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
                <Icon name="terminal" className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">OAuth 2.0 &amp; OIDC cURL Reference</h2>
                <p className="text-xs text-slate-400">
                  Direct HTTP requests against local-sso for scripts, terminal pipelines, and Postman/Insomnia.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <CodeBlock title="1. Fetch OpenID Auto-Discovery Document" code={curlDiscoverySnippet} lang="bash" />
            <CodeBlock title="2. Initiate PKCE Flow (Authorize URL)" code={curlPkceSnippet} lang="bash" />
            <CodeBlock title="3. Exchange Authorization Code for RS256 Tokens" code={curlTokenSnippet} lang="bash" />
            <CodeBlock title="4. Access Protected UserInfo Endpoint" code={curlUserInfoSnippet} lang="bash" />
            <CodeBlock title="5. Refresh Token Flow" code={curlRefreshSnippet} lang="bash" />
            <CodeBlock title="6. Verify JWT Signature Locally" code={curlVerifySnippet} lang="bash" />
          </div>
        </div>
      )}

      {/* TAB 2: Route & API Middleware */}
      {activeTab === 'mw' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
                <Icon name="shield" className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Backend &amp; Edge Token Validation Middleware</h2>
                <p className="text-xs text-slate-400">
                  Secure your Next.js Edge Middleware, API Route Handlers, or Express.js server using RS256 JWKS validation.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 p-1 bg-slate-900 rounded-xl border border-slate-800 w-fit">
              <button
                type="button"
                onClick={() => setMwSubTab('nextjs-middleware')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  mwSubTab === 'nextjs-middleware'
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Next.js Edge Middleware
              </button>
              <button
                type="button"
                onClick={() => setMwSubTab('nextjs-route')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  mwSubTab === 'nextjs-route'
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Next.js Route Handlers
              </button>
              <button
                type="button"
                onClick={() => setMwSubTab('express')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  mwSubTab === 'express' ? 'bg-orange-500/20 text-orange-400' : 'text-slate-400 hover:text-white'
                }`}
              >
                Express.js API
              </button>
            </div>
          </div>

          {mwSubTab === 'nextjs-middleware' && (
            <CodeBlock title="Next.js Edge Middleware (jose + Remote JWKS)" code={nextjsMiddlewareCode} lang="typescript" />
          )}

          {mwSubTab === 'nextjs-route' && (
            <CodeBlock title="Next.js App Router Auth Callback Handler" code={nextjsRouteHandlerCode} lang="typescript" />
          )}

          {mwSubTab === 'express' && (
            <CodeBlock title="Express.js JWT Auth Middleware (express-jwt + jwks-rsa)" code={expressMiddlewareCode} lang="typescript" />
          )}
        </div>
      )}

      {/* TAB 3: Better Auth */}
      {activeTab === 'better-auth' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
                <Icon name="zap" className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Better Auth &amp; Enterprise SSO Plugin Integration</h2>
                <p className="text-xs text-slate-400">
                  Connect Better Auth to local-sso using the official @better-auth/sso enterprise plugin.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <CodeBlock title=".env.local" code={betterAuthEnv} lang="bash" />
            <CodeBlock title="lib/auth.ts (Better Auth Server Instance)" code={betterAuthServerCode} lang="typescript" />
            <CodeBlock title="lib/auth-client.ts (Frontend Client)" code={betterAuthClientCode} lang="typescript" />
            <CodeBlock title="components/sso-login.tsx (Register &amp; Login)" code={betterAuthRegisterAndLoginCode} lang="tsx" />
            <CodeBlock title="app/api/auth/[...all]/route.ts" code={betterAuthRouteHandlerCode} lang="typescript" />
          </div>
        </div>
      )}

      {/* TAB 4: Azure MSAL */}
      {activeTab === 'msal' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
                <Icon name="globe" className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Microsoft Authentication Library (MSAL.js) Integration</h2>
                <p className="text-xs text-slate-400">
                  Configure @azure/msal-browser, @azure/msal-react, or @azure/msal-node with <code>knownAuthorities</code>.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <CodeBlock title="authConfig.ts (@azure/msal-browser Configuration)" code={msalConfigCode} lang="typescript" />
            <CodeBlock title="App.tsx (@azure/msal-react Provider &amp; Hooks)" code={msalReactCode} lang="tsx" />
            <CodeBlock title="backend-msal.ts (@azure/msal-node for Server)" code={msalNodeCode} lang="typescript" />
          </div>
        </div>
      )}

      {/* TAB 5: NextAuth.js / Auth.js */}
      {activeTab === 'nextauth' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
                <Icon name="lock" className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">NextAuth.js v5 / Auth.js Integration</h2>
                <p className="text-xs text-slate-400">
                  Use the official MicrosoftEntraID provider pointing directly to local-sso discovery and endpoints.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <CodeBlock title=".env.local" code={nextAuthEnv} lang="bash" />
            <CodeBlock title="auth.ts (NextAuth Configuration)" code={nextAuthConfigCode} lang="typescript" />
          </div>
        </div>
      )}
    </div>
  );
};
