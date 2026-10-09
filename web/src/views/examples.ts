import { getActiveProject, getProjects, setActiveProjectId } from '../storage';
import { showToast } from '../components/toast';
import { icon } from '../components/icons';
import { highlightCode } from '../components/highlight';

type ExampleTab = 'curl' | 'mw' | 'better-auth' | 'msal' | 'nextauth';
type MwSubTab = 'nextjs-middleware' | 'nextjs-route' | 'express';

export function renderExamplesView(container: HTMLElement) {
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
  const authorizeBaseUrl = `${effectiveOrigin}/${tenant}/oauth2/v2.0/authorize`;
  const tokenUrl = `${effectiveOrigin}/${tenant}/oauth2/v2.0/token`;
  const jwksUrl = `${effectiveOrigin}/${tenant}/discovery/v2.0/keys`;
  const userinfoUrl = `${effectiveOrigin}/${tenant}/oidc/userinfo`;
  const verifyApiUrl = `${effectiveOrigin}/api/verify`;

  let knownHost = window.location.host;
  try {
    knownHost = new URL(effectiveOrigin).host;
  } catch {}

  function codeBlock(title: string, code: string, lang = 'typescript'): string {
    const encoded = encodeURIComponent(code);
    const highlighted = highlightCode(code, lang);
    return `
      <div class="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-xl">
        <div class="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-rose-500/80"></span>
            <span class="w-2.5 h-2.5 rounded-full bg-amber-500/80"></span>
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
            <span class="ml-2 font-mono text-xs font-semibold text-slate-300">${title}</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 uppercase">${lang}</span>
          </div>
          <button data-copy="${encoded}" class="copy-code-btn inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-750 border border-slate-700/60 transition shadow-sm cursor-pointer">
            ${icon('copy', 'w-3.5 h-3.5 text-orange-400')}
            <span>Copy</span>
          </button>
        </div>
        <pre class="p-4 overflow-x-auto text-xs font-mono text-slate-200 leading-relaxed scrollbar-thin"><code class="language-${lang}">${highlighted}</code></pre>
      </div>
    `;
  }

  // --- 1. CURL & REST API SNIPPETS ---
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

  // --- 2. MIDDLEWARE SNIPPETS ---
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
}

// app/api/protected/route.ts (Protected API Route Handler)
// export async function GET(request: NextRequest) {
//   // Read validated user claims forwarded from middleware.ts:
//   const userId = request.headers.get('x-user-id');
//   const email = request.headers.get('x-user-email');
//   return NextResponse.json({ message: 'Authenticated', userId, email });
// }`;

  const expressMiddlewareCode = `// authMiddleware.ts (Express / Node.js API Middleware)
import { Request, Response, NextFunction } from 'express';
import { expressjwt, GetVerificationKey } from 'express-jwt';
import jwksRsa from 'jwks-rsa';

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
export function authErrorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'unauthorized',
      message: err.message,
      hint: 'Ensure Bearer token is issued by local-sso and not expired.',
    });
  }
  next(err);
}

// Usage in app.ts:
// import express from 'express';
// import { requireAuth, authErrorHandler } from './authMiddleware';
//
// const app = express();
// app.get('/api/protected/data', requireAuth, (req, res) => {
//   res.json({ message: 'Authorized', user: (req as any).auth });
// });
// app.use(authErrorHandler);`;

  // --- 3. BETTER AUTH SSO SNIPPETS ---
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
      className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-xl transition"
    >
      {loading ? "Redirecting to Local SSO..." : "Sign in with Better Auth SSO"}
    </button>
  );
}`;

  const betterAuthRouteHandlerCode = `// app/api/auth/[...all]/route.ts (Next.js App Router Route Handler)
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);`;

  // --- 4. AZURE MSAL SNIPPETS ---
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
    <button onClick={handleLogin} className="px-5 py-2.5 bg-orange-600 text-white font-semibold rounded-xl">
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
      <button onClick={handleLogout} className="px-4 py-2 bg-slate-800 text-slate-200 rounded-lg">
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

  // --- 5. NEXTAUTH / AUTH.JS SNIPPETS ---
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

  container.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      <!-- Header Banner & Project Selector -->
      <div class="glass-panel p-6 sm:p-8 rounded-3xl relative overflow-hidden">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center gap-1.5">
                ${icon('code', 'w-3.5 h-3.5')} Integration Blueprints
              </span>
              <span class="px-2.5 py-1 rounded-full text-xs font-mono bg-white/5 text-slate-400 border border-white/10">
                ${issuerMode === 'entra' ? 'Issuer: login.microsoftonline.com' : 'Issuer: localhost'}
              </span>
            </div>
            <h1 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">SSO Integration Guides &amp; Examples</h1>
            <p class="text-sm text-slate-400 max-w-2xl leading-relaxed">
              Step-by-step code snippets, environment templates, and route middleware tailored to your active local-sso project. Select a framework below to configure your application in seconds.
            </p>
          </div>

          <!-- Project Selector & Quick Actions -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div class="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-2.5 flex flex-col gap-1.5 shadow-lg">
              <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">Active Project Context</span>
              <div class="flex items-center gap-2">
                <select id="exampleProjectSelector" class="bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-xl px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:outline-none cursor-pointer">
                  ${projects
                    .map(
                      (p) => `<option value="${p.id}" ${p.id === project.id ? 'selected' : ''}>${p.name} (${p.tenant})</option>`
                    )
                    .join('')}
                </select>
                <a href="#config" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition flex items-center gap-1.5 whitespace-nowrap">
                  ${icon('settings', 'w-3.5 h-3.5 text-orange-400')} Config
                </a>
              </div>
            </div>

            <a href="#login" class="px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold rounded-2xl shadow-lg shadow-orange-500/20 transition flex items-center justify-center gap-2">
              ${icon('rocket', 'w-4 h-4')} Test Client
            </a>
          </div>
        </div>

        <!-- Dynamic Parameter Badge Ribbon -->
        <div class="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div class="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span class="text-slate-500 text-[10px] block uppercase">Tenant</span>
            <span class="text-slate-200 truncate block font-semibold">${tenant}</span>
          </div>
          <div class="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span class="text-slate-500 text-[10px] block uppercase">Client ID</span>
            <span class="text-slate-200 truncate block font-semibold">${project.clientId}</span>
          </div>
          <div class="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span class="text-slate-500 text-[10px] block uppercase">Redirect URI</span>
            <span class="text-slate-200 truncate block font-semibold">${project.redirectUri}</span>
          </div>
          <div class="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span class="text-slate-500 text-[10px] block uppercase">Local SSO Origin</span>
            <span class="text-orange-400 truncate block font-semibold">${effectiveOrigin}</span>
          </div>
        </div>
      </div>

      <!-- Main Technology Tabs Navigation Bar -->
      <div class="glass-panel p-2 rounded-2xl flex flex-wrap items-center gap-1.5 border border-slate-800">
        <button id="guideTabCurl" data-tab="curl" class="guide-nav-btn flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition border bg-orange-500/15 text-orange-400 border-orange-500/30 shadow-sm cursor-pointer">
          ${icon('terminal', 'w-4 h-4')}
          <span>API &amp; cURL</span>
        </button>

        <button id="guideTabMw" data-tab="mw" class="guide-nav-btn flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent cursor-pointer">
          ${icon('shield', 'w-4 h-4')}
          <span>Route &amp; API Middleware</span>
        </button>

        <button id="guideTabBetterAuth" data-tab="better-auth" class="guide-nav-btn flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent cursor-pointer">
          ${icon('zap', 'w-4 h-4')}
          <span>Better Auth SSO</span>
        </button>

        <button id="guideTabMsal" data-tab="msal" class="guide-nav-btn flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent cursor-pointer">
          ${icon('globe', 'w-4 h-4')}
          <span>Azure MSAL</span>
        </button>

        <button id="guideTabNextAuth" data-tab="nextauth" class="guide-nav-btn flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent cursor-pointer">
          ${icon('lock', 'w-4 h-4')}
          <span>NextAuth / Auth.js</span>
        </button>
      </div>

      <!-- TAB CONTAINER 1: API & CURL (FIRST TAB) -->
      <div id="contentCurl" class="tab-content space-y-6">
        <div class="glass-panel p-6 rounded-2xl space-y-3">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
              ${icon('terminal', 'w-5 h-5')}
            </div>
            <div>
              <h2 class="text-lg font-bold text-white">OAuth 2.0 &amp; OpenID Connect REST API / cURL</h2>
              <p class="text-xs text-slate-400">
                Direct HTTP requests to execute the full OpenID Connect authorization code flow with PKCE, inspect tokens, and manage sessions.
              </p>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 1: OIDC Discovery Document</h3>
            <span class="text-xs text-slate-400">GET /.well-known/openid-configuration</span>
          </div>
          ${codeBlock('Discovery Document Request', curlDiscoverySnippet, 'curl')}
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 2: PKCE S256 Setup &amp; Authorization URL</h3>
            <span class="text-xs text-slate-400">Generate verifier and open authorize URL</span>
          </div>
          ${codeBlock('Authorize Request (PKCE S256)', curlPkceSnippet, 'bash')}
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 3: Redeem Authorization Code for Tokens</h3>
            <span class="text-xs text-slate-400">POST /oauth2/v2.0/token</span>
          </div>
          ${codeBlock('Token Exchange Request', curlTokenSnippet, 'curl')}
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 4: Fetch User Claims</h3>
            <span class="text-xs text-slate-400">GET /oidc/userinfo</span>
          </div>
          ${codeBlock('UserInfo Claims Request', curlUserInfoSnippet, 'curl')}
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 5: Refresh Expired Access Token</h3>
            <span class="text-xs text-slate-400">POST /oauth2/v2.0/token (refresh_token)</span>
          </div>
          ${codeBlock('Refresh Token Request', curlRefreshSnippet, 'curl')}
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 6: Inspect &amp; Verify Token Claims</h3>
            <span class="text-xs text-slate-400">POST /api/verify</span>
          </div>
          ${codeBlock('Token Verification Request', curlVerifySnippet, 'curl')}
        </div>
      </div>

      <!-- TAB CONTAINER 2: MIDDLEWARE INTEGRATION -->
      <div id="contentMw" class="tab-content space-y-6 hidden">
        <div class="glass-panel p-6 rounded-2xl space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 class="text-lg font-bold text-white flex items-center gap-2">
                ${icon('shield', 'w-5 h-5 text-orange-400')} Route &amp; API Token Verification Middleware
              </h2>
              <p class="text-xs text-slate-400 mt-1">
                Protect routes and verify incoming RS256 Bearer access tokens on Next.js Edge, Next.js App Router handlers, and Node.js / Express services.
              </p>
            </div>
            
            <!-- Sub-tabs for Middleware language/runtime -->
            <div class="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs shrink-0">
              <button id="subTabNextjsMw" class="mw-sub-btn px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-400 font-semibold transition cursor-pointer">Next.js Edge</button>
              <button id="subTabNextjsRoute" class="mw-sub-btn px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.03] transition cursor-pointer">Next.js Route Handlers</button>
              <button id="subTabExpress" class="mw-sub-btn px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.03] transition cursor-pointer">Express / Node</button>
            </div>
          </div>

          <!-- Architecture & local-sso details -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div class="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1">
              <span class="font-semibold text-slate-200 flex items-center gap-1.5">
                ${icon('key', 'w-3.5 h-3.5 text-amber-400')} RS256 Public JWKS Key
              </span>
              <p class="text-slate-400 text-[11px] font-mono break-all">${jwksUrl}</p>
            </div>
            <div class="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1">
              <span class="font-semibold text-slate-200 flex items-center gap-1.5">
                ${icon('globe', 'w-3.5 h-3.5 text-sky-400')} Expected Token Issuer
              </span>
              <p class="text-slate-400 text-[11px] font-mono break-all">${issuerUrl}</p>
            </div>
            <div class="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1">
              <span class="font-semibold text-slate-200 flex items-center gap-1.5">
                ${icon('id-card', 'w-3.5 h-3.5 text-emerald-400')} Target Audience (aud)
              </span>
              <p class="text-slate-400 text-[11px] font-mono break-all">${project.clientId}</p>
            </div>
          </div>
        </div>

        <!-- Sub Content: Next.js Edge Middleware -->
        <div id="subContentNextjsMw" class="mw-sub-content space-y-4">
          <div class="glass-panel p-5 rounded-2xl space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>Step 1: Install Edge-Compatible JWT Library</span>
              </h3>
              <button data-copy="${encodeURIComponent('npm install jose')}" class="copy-code-btn text-xs text-orange-400 hover:underline cursor-pointer">Copy command</button>
            </div>
            <pre class="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400">npm install jose</pre>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-white">Step 2: Add Next.js Route Middleware (Edge Runtime)</h3>
              <span class="text-xs text-slate-400">Protects pages and extracts user headers</span>
            </div>
            ${codeBlock('middleware.ts', nextjsMiddlewareCode, 'typescript')}
          </div>
        </div>

        <!-- Sub Content: Next.js App Router Route Handlers -->
        <div id="subContentNextjsRoute" class="mw-sub-content space-y-4 hidden">
          <div class="glass-panel p-5 rounded-2xl space-y-2">
            <h3 class="text-sm font-bold text-white">Next.js App Router Auth &amp; Protected Route Handlers</h3>
            <p class="text-xs text-slate-400">
              Complete OAuth2 callback handler exchanging authorization codes for tokens, storing HTTP-only cookies, and sample protected API endpoints.
            </p>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-white">Auth Callback Route &amp; Token Exchange</h3>
              <span class="text-xs text-slate-400">app/api/auth/callback/route.ts</span>
            </div>
            ${codeBlock('app/api/auth/callback/route.ts', nextjsRouteHandlerCode, 'typescript')}
          </div>
        </div>

        <!-- Sub Content: Express / Node Middleware -->
        <div id="subContentExpress" class="mw-sub-content space-y-4 hidden">
          <div class="glass-panel p-5 rounded-2xl space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-white">Step 1: Install Express JWT &amp; JWKS Resolver</h3>
              <button data-copy="${encodeURIComponent('npm install express-jwt jwks-rsa @types/express')}" class="copy-code-btn text-xs text-orange-400 hover:underline cursor-pointer">Copy command</button>
            </div>
            <pre class="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400">npm install express-jwt jwks-rsa @types/express</pre>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-white">Step 2: Implement Bearer Token Verification</h3>
              <span class="text-xs text-slate-400">Caches local-sso public keys and parses claims</span>
            </div>
            ${codeBlock('authMiddleware.ts', expressMiddlewareCode, 'typescript')}
          </div>
        </div>

        <!-- Important Notes Callout -->
        <div class="p-4 rounded-2xl border border-orange-500/30 bg-orange-500/[0.06] text-xs space-y-2">
          <div class="flex items-center gap-2 text-orange-400 font-semibold">
            ${icon('info', 'w-4 h-4')} Local Development Gotcha: Issuer Mode
          </div>
          <p class="text-slate-300 leading-relaxed text-[11px]">
            If your JWT validation library fails with <code class="text-rose-400">"jwt issuer invalid"</code>, check your project's <strong>Issuer Mode</strong> in the Endpoints &amp; Config tab.
            When set to <em>Host Origin</em> (default), local-sso issues tokens with <code class="text-orange-300 font-mono">${effectiveOrigin}/${tenant}/v2.0</code>.
            If your backend expects official Microsoft Entra tokens, switch Issuer Mode to <em>Entra ID</em> to issue tokens signed with <code class="text-orange-300 font-mono">https://login.microsoftonline.com/${tenant}/v2.0</code>.
          </p>
        </div>
      </div>

      <!-- TAB CONTAINER 3: BETTER AUTH SSO -->
      <div id="contentBetterAuth" class="tab-content space-y-6 hidden">
        <div class="glass-panel p-6 rounded-2xl space-y-3">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
              ${icon('zap', 'w-5 h-5')}
            </div>
            <div>
              <h2 class="text-lg font-bold text-white">Better Auth Enterprise SSO Integration (@better-auth/sso)</h2>
              <p class="text-xs text-slate-400">
                Official enterprise SSO plugin for Better Auth using OpenID Connect discovery and local-sso.
              </p>
            </div>
          </div>
          <p class="text-xs text-slate-300 leading-relaxed">
            The official <strong>@better-auth/sso</strong> plugin enables enterprise OIDC and SAML identity providers. You can register local-sso using its standard OIDC issuer URL (<code class="text-orange-300">${issuerUrl}</code>). Better Auth automatically fetches <code class="text-orange-300">${discoveryUrl}</code> to configure authorization, token, and userinfo endpoints.
          </p>
        </div>

        <!-- Step 1: Install -->
        <div class="glass-panel p-5 rounded-2xl space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 1: Install Better Auth &amp; the SSO Plugin</h3>
            <button data-copy="${encodeURIComponent('npm install better-auth @better-auth/sso')}" class="copy-code-btn text-xs text-orange-400 hover:underline cursor-pointer">Copy command</button>
          </div>
          <pre class="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400">npm install better-auth @better-auth/sso</pre>
        </div>

        <!-- Step 2: Environment variables -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 2: Configure Environment Variables</h3>
            <span class="text-xs text-slate-400">Injected with active project values</span>
          </div>
          ${codeBlock('.env.local', betterAuthEnv, 'shell')}
        </div>

        <!-- Step 3: Server Auth Instance with sso() plugin -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 3: Server Auth Instance with sso() Plugin</h3>
            <span class="text-xs text-slate-400">lib/auth.ts</span>
          </div>
          ${codeBlock('lib/auth.ts', betterAuthServerCode, 'typescript')}
        </div>

        <!-- Step 4: Route Handler -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 4: Mount Next.js App Router Catch-All Route</h3>
            <span class="text-xs text-slate-400">app/api/auth/[...all]/route.ts</span>
          </div>
          ${codeBlock('app/api/auth/[...all]/route.ts', betterAuthRouteHandlerCode, 'typescript')}
        </div>

        <!-- Step 5: Frontend Client with ssoClient() plugin -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 5: Frontend Client with ssoClient() Plugin</h3>
            <span class="text-xs text-slate-400">lib/auth-client.ts</span>
          </div>
          ${codeBlock('lib/auth-client.ts', betterAuthClientCode, 'typescript')}
        </div>

        <!-- Step 6: Registration & Login Button -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 6: Register Local SSO &amp; Trigger Sign-In</h3>
            <span class="text-xs text-slate-400">components/sso-login.tsx</span>
          </div>
          ${codeBlock('components/sso-login.tsx', betterAuthRegisterAndLoginCode, 'typescript')}
        </div>
      </div>

      <!-- TAB CONTAINER 4: AZURE MSAL -->
      <div id="contentMsal" class="tab-content space-y-6 hidden">
        <div class="glass-panel p-6 rounded-2xl space-y-3">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
              ${icon('globe', 'w-5 h-5')}
            </div>
            <div>
              <h2 class="text-lg font-bold text-white">Official Azure MSAL SDK Integration</h2>
              <p class="text-xs text-slate-400">
                Connect official <code class="text-white font-mono">@azure/msal-browser</code> and <code class="text-white font-mono">@azure/msal-react</code> packages directly to local-sso.
              </p>
            </div>
          </div>
          <div class="p-3.5 rounded-xl bg-sky-500/[0.08] border border-sky-500/25 text-xs text-sky-200">
            <strong>Key Requirement for Local Dev:</strong> You must specify <code class="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">knownAuthorities: ["${knownHost}"]</code> in your MSAL config. Otherwise, MSAL rejects non-Microsoft domains as untrusted authorities.
          </div>
        </div>

        <!-- Step 1: Install -->
        <div class="glass-panel p-5 rounded-2xl space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 1: Install MSAL Packages</h3>
            <button data-copy="${encodeURIComponent('npm install @azure/msal-browser @azure/msal-react')}" class="copy-code-btn text-xs text-orange-400 hover:underline cursor-pointer">Copy command</button>
          </div>
          <pre class="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400">npm install @azure/msal-browser @azure/msal-react</pre>
        </div>

        <!-- Step 2: MSAL Browser Configuration -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 2: Create MSAL Configuration</h3>
            <span class="text-xs text-slate-400">Configured with project client ID and authority</span>
          </div>
          ${codeBlock('authConfig.ts', msalConfigCode, 'typescript')}
        </div>

        <!-- Step 3: React Provider & Sign In -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 3: React UI &amp; Authentication Flow</h3>
            <span class="text-xs text-slate-400">Uses MsalProvider and useMsal() hooks</span>
          </div>
          ${codeBlock('App.tsx', msalReactCode, 'typescript')}
        </div>

        <!-- Step 4: Backend MSAL Node -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 4: Backend Confidential Client (@azure/msal-node)</h3>
            <span class="text-xs text-slate-400">For SSR authorization code exchange or daemon apps</span>
          </div>
          ${codeBlock('backend-msal.ts', msalNodeCode, 'typescript')}
        </div>
      </div>

      <!-- TAB CONTAINER 5: NEXTAUTH / AUTH.JS -->
      <div id="contentNextAuth" class="tab-content space-y-6 hidden">
        <div class="glass-panel p-6 rounded-2xl space-y-3">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              ${icon('lock', 'w-5 h-5')}
            </div>
            <div>
              <h2 class="text-lg font-bold text-white">NextAuth.js v5 / Auth.js Integration</h2>
              <p class="text-xs text-slate-400">
                Configure standard NextAuth MicrosoftEntraID provider to authenticate with local-sso.
              </p>
            </div>
          </div>
        </div>

        <div class="glass-panel p-5 rounded-2xl space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 1: Install NextAuth</h3>
            <button data-copy="${encodeURIComponent('npm install next-auth@beta')}" class="copy-code-btn text-xs text-orange-400 hover:underline cursor-pointer">Copy command</button>
          </div>
          <pre class="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400">npm install next-auth@beta</pre>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Step 2: Configure Microsoft Entra Provider in auth.ts</h3>
            <span class="text-xs text-slate-400">Points discovery and endpoints to local-sso</span>
          </div>
          ${codeBlock('auth.ts', nextAuthConfigCode, 'typescript')}
        </div>
      </div>

    </div>
  `;

  // --- Attach Event Listeners ---

  // Project selector change
  document.getElementById('exampleProjectSelector')?.addEventListener('change', (e) => {
    setActiveProjectId((e.target as HTMLSelectElement).value);
    renderExamplesView(container);
    showToast('Project context updated for code examples');
  });

  // Main Category Tabs switching (Curl is first)
  const tabButtons: Record<ExampleTab, HTMLElement | null> = {
    curl: document.getElementById('guideTabCurl'),
    mw: document.getElementById('guideTabMw'),
    'better-auth': document.getElementById('guideTabBetterAuth'),
    msal: document.getElementById('guideTabMsal'),
    nextauth: document.getElementById('guideTabNextAuth'),
  };

  const contentContainers: Record<ExampleTab, HTMLElement | null> = {
    curl: document.getElementById('contentCurl'),
    mw: document.getElementById('contentMw'),
    'better-auth': document.getElementById('contentBetterAuth'),
    msal: document.getElementById('contentMsal'),
    nextauth: document.getElementById('contentNextAuth'),
  };

  function selectTab(tabKey: ExampleTab) {
    Object.entries(tabButtons).forEach(([key, btn]) => {
      if (!btn) return;
      if (key === tabKey) {
        btn.className = 'guide-nav-btn flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition border bg-orange-500/15 text-orange-400 border-orange-500/30 shadow-sm cursor-pointer';
      } else {
        btn.className = 'guide-nav-btn flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent cursor-pointer';
      }
    });

    Object.entries(contentContainers).forEach(([key, box]) => {
      if (!box) return;
      if (key === tabKey) {
        box.classList.remove('hidden');
      } else {
        box.classList.add('hidden');
      }
    });
  }

  Object.entries(tabButtons).forEach(([key, btn]) => {
    btn?.addEventListener('click', () => {
      selectTab(key as ExampleTab);
    });
  });

  // Middleware sub-tabs switching (Next.js Edge vs Next.js Route Handlers vs Express)
  const mwSubButtons: Record<MwSubTab, HTMLElement | null> = {
    'nextjs-middleware': document.getElementById('subTabNextjsMw'),
    'nextjs-route': document.getElementById('subTabNextjsRoute'),
    express: document.getElementById('subTabExpress'),
  };

  const mwSubContents: Record<MwSubTab, HTMLElement | null> = {
    'nextjs-middleware': document.getElementById('subContentNextjsMw'),
    'nextjs-route': document.getElementById('subContentNextjsRoute'),
    express: document.getElementById('subContentExpress'),
  };

  function selectMwSubTab(subKey: MwSubTab) {
    Object.entries(mwSubButtons).forEach(([key, btn]) => {
      if (!btn) return;
      if (key === subKey) {
        btn.className = 'mw-sub-btn px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-400 font-semibold transition cursor-pointer';
      } else {
        btn.className = 'mw-sub-btn px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.03] transition cursor-pointer';
      }
    });

    Object.entries(mwSubContents).forEach(([key, content]) => {
      if (!content) return;
      if (key === subKey) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    });
  }

  Object.entries(mwSubButtons).forEach(([key, btn]) => {
    btn?.addEventListener('click', () => {
      selectMwSubTab(key as MwSubTab);
    });
  });

  // Copy code buttons with instant toast feedback
  container.querySelectorAll('.copy-code-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const raw = btn.getAttribute('data-copy');
      if (raw) {
        const text = decodeURIComponent(raw);
        navigator.clipboard.writeText(text);
        showToast('Copied code to clipboard!', 'success');
        
        // Brief visual indicator
        const span = btn.querySelector('span');
        if (span) {
          const original = span.textContent;
          span.textContent = 'Copied!';
          setTimeout(() => {
            span.textContent = original;
          }, 1500);
        }
      }
    });
  });
}
