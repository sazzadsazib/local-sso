import { getActiveProject } from '../storage';
import { icon } from '../components/icons';
import { showToast } from '../components/toast';
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

function getIssuerValue(project: Profile): string {
  if (project.issuerMode === 'entra') {
    return `https://login.microsoftonline.com/${project.tenant}/v2.0`;
  }
  return getAuthority(project);
}

import { highlightCode } from '../components/highlight';

function getHostName(project: Profile): string {
  return normalizePath(project.host || window.location.origin).replace(/^https?:\/\//, '');
}

function codeBlock(file: string, language: string, code: string): string {
  const highlighted = highlightCode(code, language);
  return `
    <div class="code-block">
      <div class="code-head">
        <div class="code-file">
          <span>${escapeHtml(file)}</span>
          <span class="code-lang">${escapeHtml(language)}</span>
        </div>
        <button type="button" class="code-copy" data-copy-code="${escapeHtml(code)}" title="Copy ${escapeHtml(file)}">
          ${icon('copy', 'w-3 h-3')} <span>Copy</span>
        </button>
      </div>
      <pre class="code-body"><code class="language-${escapeHtml(language)}">${highlighted}</code></pre>
    </div>
  `;
}

function guideStep(num: number, title: string, desc: string, snippet: string): string {
  const pad = String(num).padStart(2, '0');
  return `
    <div class="step-block">
      <div class="step-heading">
        <span class="step-number">${pad}</span>
        <div>
          <div class="step-title">${escapeHtml(title)}</div>
          ${desc ? `<p class="step-copy">${escapeHtml(desc)}</p>` : ''}
        </div>
      </div>
      ${snippet}
    </div>
  `;
}

export function renderExamplesView(container: HTMLElement) {
  const project = getActiveProject();
  let activeTab: 'curl' | 'middleware' | 'better-auth' | 'msal' | 'nextauth' = 'curl';
  let middlewareSubTab: 'nextjs-middleware' | 'nextjs-route' | 'express' = 'nextjs-middleware';

  const render = () => {
    const base = getAuthority(project);
    const host = getHostName(project);
    const discovery = `${base}/oauth2/v2.0/.well-known/openid-configuration`;
    const userinfo = `${base}/oidc/userinfo`;
    const token = `${base}/oauth2/v2.0/token`;
    const jwks = `${base}/discovery/v2.0/keys`;
    const issuer = getIssuerValue(project);
    const authorize = `${base}/oauth2/v2.0/authorize`;
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    let contentHtml = '';

    if (activeTab === 'curl') {
      contentHtml = `
        <div class="guide-intro">
          <div class="guide-intro-copy">
            <h2>Test the full flow from the terminal</h2>
            <p>Start with discovery, generate a PKCE challenge, exchange the authorization code, then inspect the returned identity claims.</p>
          </div>
          <span class="chip">cURL</span>
        </div>
        ${guideStep(
          1,
          'Read the discovery document',
          'Confirm the issuer and endpoint set advertised by the local provider.',
          codeBlock('discovery.sh', 'shell', `curl -s "${discovery}" | jq .`)
        )}
        ${guideStep(
          2,
          'Generate a PKCE verifier and challenge',
          'Keep the verifier until the token exchange completes.',
          codeBlock(
            'pkce.sh',
            'shell',
            `VERIFIER="${verifier}"\nCHALLENGE="E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"\n\necho "${authorize}?client_id=${project.clientId}&response_type=code&redirect_uri=${encodeURIComponent(project.redirectUri)}&scope=${encodeURIComponent(project.scope)}&code_challenge=$CHALLENGE&code_challenge_method=S256&prompt=select_account"`
          )
        )}
        ${guideStep(
          3,
          'Exchange the authorization code',
          'Send the code and verifier to the token endpoint.',
          codeBlock(
            'token.sh',
            'shell',
            `curl -X POST "${token}" \\\n  -H "Content-Type: application/x-www-form-urlencoded" \\\n  -d "grant_type=authorization_code" \\\n  -d "client_id=${project.clientId}" \\\n  -d "client_secret=${project.clientSecret || 'local-sso-secret'}" \\\n  -d "code=MOCK_AUTH_CODE" \\\n  -d "code_verifier=$VERIFIER" \\\n  -d "redirect_uri=${project.redirectUri}"`
          )
        )}
        ${guideStep(
          4,
          'Read the authenticated profile',
          'Use the access token with the local UserInfo helper.',
          codeBlock('userinfo.sh', 'shell', `curl -s "${userinfo}" \\\n  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" | jq .`)
        )}
        ${guideStep(
          5,
          'Verify the ID token',
          'Validate the signature and claims returned for the selected mock user.',
          codeBlock(
            'verify.sh',
            'shell',
            `curl -X POST "${normalizePath(project.host || window.location.origin)}/api/verify" \\\n  -H "Content-Type: application/json" \\\n  -d '{"token":"YOUR_JWT_ACCESS_OR_ID_TOKEN"}'`
          )
        )}
      `;
    } else if (activeTab === 'middleware') {
      let codeSnippet = '';
      if (middlewareSubTab === 'nextjs-route') {
        codeSnippet = codeBlock(
          'app/api/auth/callback/route.ts',
          'typescript',
          `import { NextResponse } from "next/server";\nimport { jwtVerify, createRemoteJWKSet } from "jose";\n\nconst JWKS = createRemoteJWKSet(new URL("${jwks}"));\n\nexport async function GET(request: Request) {\n  const token = new URL(request.url).searchParams.get("id_token");\n  if (!token) return NextResponse.json({ error: "Missing id_token" }, { status: 400 });\n\n  const { payload } = await jwtVerify(token, JWKS, {\n    issuer: "${issuer}",\n    audience: "${project.clientId}"\n  });\n\n  const response = NextResponse.redirect("${project.rootUrl}");\n  response.cookies.set("sso_subject", String(payload.sub), { httpOnly: true, sameSite: "lax" });\n  return response;\n}`
        );
      } else if (middlewareSubTab === 'express') {
        codeSnippet = codeBlock(
          'authMiddleware.ts',
          'typescript',
          `import type { Request, Response, NextFunction } from "express";\nimport { jwtVerify, createRemoteJWKSet } from "jose";\n\nconst JWKS = createRemoteJWKSet(new URL("${jwks}"));\n\nexport async function requireSso(req: Request, res: Response, next: NextFunction) {\n  const header = req.headers.authorization;\n  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;\n  if (!token) return res.status(401).json({ error: "Missing bearer token" });\n\n  try {\n    const { payload } = await jwtVerify(token, JWKS, {\n      issuer: "${issuer}",\n      audience: "${project.clientId}"\n    });\n    res.locals.user = payload;\n    next();\n  } catch (error) {\n    res.status(401).json({ error: "Invalid token" });\n  }\n}`
        );
      } else {
        codeSnippet = codeBlock(
          'middleware.ts',
          'typescript',
          `import { NextResponse } from "next/server";\nimport type { NextRequest } from "next/server";\nimport { jwtVerify, createRemoteJWKSet } from "jose";\n\nconst JWKS = createRemoteJWKSet(new URL("${jwks}"));\n\nexport async function middleware(request: NextRequest) {\n  const token = request.cookies.get("sso_access_token")?.value;\n\n  if (!token) {\n    const loginUrl = new URL("${authorize}");\n    loginUrl.searchParams.set("client_id", "${project.clientId}");\n    loginUrl.searchParams.set("response_type", "code");\n    loginUrl.searchParams.set("redirect_uri", "${project.redirectUri}");\n    loginUrl.searchParams.set("scope", "${project.scope}");\n    return NextResponse.redirect(loginUrl);\n  }\n\n  try {\n    const { payload } = await jwtVerify(token, JWKS, {\n      issuer: "${issuer}",\n      audience: "${project.clientId}"\n    });\n    const headers = new Headers(request.headers);\n    headers.set("x-user-id", String(payload.sub));\n    headers.set("x-user-email", String(payload.preferred_username || payload.email || ""));\n    return NextResponse.next({ request: { headers } });\n  } catch (error) {\n    return NextResponse.redirect(new URL("${project.rootUrl}", request.url));\n  }\n}\n\nexport const config = { matcher: ["/dashboard/:path*", "/api/:path*"] };`
        );
      }

      contentHtml = `
        <div class="guide-intro">
          <div class="guide-intro-copy">
            <h2>Protect routes with RS256 tokens</h2>
            <p>Verify incoming access tokens against the local JWKS before forwarding identity claims to your application.</p>
          </div>
          <div class="sub-tabs">
            <button type="button" class="sub-tab${middlewareSubTab === 'nextjs-middleware' ? ' is-active' : ''}" data-mid-tab="nextjs-middleware">Next.js Edge</button>
            <button type="button" class="sub-tab${middlewareSubTab === 'nextjs-route' ? ' is-active' : ''}" data-mid-tab="nextjs-route">Route handler</button>
            <button type="button" class="sub-tab${middlewareSubTab === 'express' ? ' is-active' : ''}" data-mid-tab="express">Express / Node</button>
          </div>
        </div>
        ${guideStep(1, 'Install the token verifier', 'Use a JWKS-aware JWT library rather than decoding the token trustingly.', codeBlock('terminal', 'shell', 'npm install jose'))}
        ${guideStep(2, 'Add the verification middleware', 'Validate issuer and audience, then forward only verified identity claims.', codeSnippet)}
      `;
    } else if (activeTab === 'better-auth') {
      contentHtml = `
        <div class="guide-intro">
          <div class="guide-intro-copy">
            <h2>Enterprise SSO with Better Auth</h2>
            <p>Register the local provider as an OIDC identity source using discovery, then mount the catch-all authentication route.</p>
          </div>
          <span class="chip">Better Auth</span>
        </div>
        ${guideStep(1, 'Install Better Auth and the SSO plugin', 'The plugin adds enterprise OIDC and SAML providers to your auth instance.', codeBlock('terminal', 'shell', 'npm install better-auth @better-auth/sso'))}
        ${guideStep(2, 'Configure environment values', 'Point the provider at the local discovery document.', codeBlock('.env.local', 'shell', `BETTER_AUTH_SECRET=replace-with-a-local-secret\nLOCAL_SSO_ISSUER=${issuer}\nLOCAL_SSO_DISCOVERY_URL=${discovery}`))}
        ${guideStep(3, 'Create the server auth instance', 'Register the local issuer and map the returned claims.', codeBlock('lib/auth.ts', 'typescript', `import { betterAuth } from "better-auth";\nimport { sso } from "@better-auth/sso";\n\nexport const auth = betterAuth({\n  plugins: [\n    sso({\n      providers: [\n        {\n          providerId: "local-sso",\n          issuer: "${issuer}",\n          clientId: "${project.clientId}",\n          clientSecret: process.env.LOCAL_SSO_CLIENT_SECRET!,\n          scopes: "${project.scope}".split(" "),\n          redirectUri: "${project.redirectUri}"\n        }\n      ]\n    })\n  ]\n});`))}
        ${guideStep(4, 'Mount the route handler', 'Expose Better Auth through a Next.js App Router catch-all route.', codeBlock('app/api/auth/[...all]/route.ts', 'typescript', `import { auth } from "@/lib/auth";\nimport { toNextJsHandler } from "better-auth/next-js";\n\nexport const { GET, POST } = toNextJsHandler(auth);`))}
      `;
    } else if (activeTab === 'msal') {
      contentHtml = `
        <div class="guide-intro">
          <div class="guide-intro-copy">
            <h2>Official Azure MSAL SDK</h2>
            <p>Use Microsoft's browser library with the local provider. A host-based issuer requires an explicit known authority entry.</p>
          </div>
          <span class="chip">MSAL.js</span>
        </div>
        ${guideStep(1, 'Install the MSAL packages', 'Add the browser client and React bindings if your app uses React.', codeBlock('terminal', 'shell', 'npm install @azure/msal-browser @azure/msal-react'))}
        ${guideStep(2, 'Create the MSAL configuration', 'Add the local host to knownAuthorities so MSAL accepts the local issuer.', codeBlock('authConfig.ts', 'typescript', `import { PublicClientApplication } from "@azure/msal-browser";\n\nexport const msalConfig = {\n  auth: {\n    clientId: "${project.clientId}",\n    authority: "${issuer}",\n    knownAuthorities: ["${host}"],\n    redirectUri: "${project.redirectUri}",\n    postLogoutRedirectUri: "${project.rootUrl}"\n  },\n  cache: {\n    cacheLocation: "localStorage",\n    storeAuthStateInCookie: false\n  }\n};\n\nexport const msalInstance = new PublicClientApplication(msalConfig);`))}
        ${guideStep(3, 'Start the login request', 'Request an authorization code with PKCE and the scopes your client needs.', codeBlock('login.ts', 'typescript', `const response = await msalInstance.loginPopup({\n  scopes: "${project.scope}".split(" "),\n  prompt: "select_account"\n});\n\nconsole.log(response.account?.username);`))}
      `;
    } else if (activeTab === 'nextauth') {
      contentHtml = `
        <div class="guide-intro">
          <div class="guide-intro-copy">
            <h2>NextAuth.js v5 / Auth.js</h2>
            <p>Use the Microsoft Entra ID provider with a local issuer, then expose the standard authentication handlers.</p>
          </div>
          <span class="chip">NextAuth</span>
        </div>
        ${guideStep(1, 'Install NextAuth', 'Add the current Auth.js package to your Next.js application.', codeBlock('terminal', 'shell', 'npm install next-auth@beta'))}
        ${guideStep(2, 'Configure the Entra ID provider', 'Set the local issuer and credentials for the active project.', codeBlock('auth.ts', 'typescript', `import NextAuth from "next-auth";\nimport MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";\n\nexport const { handlers, signIn, signOut, auth } = NextAuth({\n  providers: [\n    MicrosoftEntraID({\n      clientId: "${project.clientId}",\n      clientSecret: process.env.LOCAL_SSO_CLIENT_SECRET!,\n      issuer: "${issuer}",\n      authorization: {\n        params: {\n          scope: "${project.scope}"\n        }\n      }\n    })\n  ]\n});`))}
        ${guideStep(3, 'Expose the route handler', 'Mount the standard NextAuth handler in the App Router.', codeBlock('app/api/auth/[...nextauth]/route.ts', 'typescript', `import { handlers } from "@/auth";\n\nexport const { GET, POST } = handlers;`))}
        ${guideStep(4, 'Add environment values', 'Keep the mock client secret out of source control.', codeBlock('.env.local', 'shell', `AUTH_SECRET=replace-with-a-local-secret\nLOCAL_SSO_CLIENT_SECRET=${project.clientSecret || 'local-sso-secret'}`))}
      `;
    }

    container.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div class="page-head-copy">
            <div class="eyebrow">
              <span class="eyebrow-index">04</span>
              <span>Developer resources</span>
              <span class="eyebrow-rule"></span>
            </div>
            <h1 class="page-title">Integration guides</h1>
            <p class="page-description">Copy working examples for the active project, <strong>${escapeHtml(project.name)}</strong>. Every value updates dynamically when you switch projects.</p>
          </div>
          <div class="page-actions">
            <span class="chip chip-accent">${escapeHtml(project.tenant)}</span>
            <span class="chip">${escapeHtml(project.scope.split(' ')[0] || 'openid')}</span>
          </div>
        </header>

        <div class="guide-nav" role="tablist" aria-label="Integration guides">
          <button type="button" class="guide-tab${activeTab === 'curl' ? ' is-active' : ''}" data-gtab="curl">cURL</button>
          <button type="button" class="guide-tab${activeTab === 'middleware' ? ' is-active' : ''}" data-gtab="middleware">Middleware</button>
          <button type="button" class="guide-tab${activeTab === 'better-auth' ? ' is-active' : ''}" data-gtab="better-auth">Better Auth</button>
          <button type="button" class="guide-tab${activeTab === 'msal' ? ' is-active' : ''}" data-gtab="msal">MSAL.js</button>
          <button type="button" class="guide-tab${activeTab === 'nextauth' ? ' is-active' : ''}" data-gtab="nextauth">NextAuth</button>
        </div>

        <div class="panel">
          <div class="panel-body">
            ${contentHtml}
          </div>
        </div>

        <div class="note">
          ${icon('info', 'w-4 h-4')}
          <span>These examples target the local mock provider. Keep client secrets out of source control and production logs, even when using disposable test tenants.</span>
        </div>
      </section>
    `;

    // Bind tab events
    container.querySelectorAll<HTMLButtonElement>('[data-gtab]').forEach((b) => {
      b.addEventListener('click', () => {
        activeTab = b.dataset.gtab as any;
        render();
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-mid-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        middlewareSubTab = b.dataset.midTab as any;
        render();
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-copy-code]').forEach((b) => {
      b.addEventListener('click', () => {
        const code = b.dataset.copyCode || '';
        navigator.clipboard.writeText(code);
        showToast('Copied code snippet to clipboard');
      });
    });
  };

  render();
}
