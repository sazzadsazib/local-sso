# local-sso — Technical Implementation Reference

`local-sso` is a single-binary developer tool that runs a **Local Mock Microsoft Entra ID (OIDC) Identity Provider** and a **built-in SSO Test & Management Playground**.

---

## 1. Architectural Overview

```
                          ┌────────────────────────────────────────────────────────┐
                          │         Your Frontend App (e.g., localhost:3000)       │
                          │             (@azure/msal-browser, React, etc.)         │
                          └─────────────┬────────────────────────────▲─────────────┘
                                        │                            │
                     1. Authorize Redir │                            │ 5. Session Created
                                        ▼                            │
┌────────────────────────────────────────────────────────────────────┴──────────────────────────────────────┐
│  local-sso (Single Go Binary on http://localhost:8080)                                                    │
│                                                                                                           │
│  ┌─────────────────────────┐   ┌──────────────────────────┐   ┌────────────────────────────────────────┐  │
│  │ OIDC Discovery & JWKS   │   │ Interactive Mock Sign-in │   │ Token Signer & PKCE Engine             │  │
│  │ GET /{tenant}/.well-kn..│   │ GET /{tenant}/oauth2/... │   │ POST /{tenant}/oauth2/v2.0/token       │  │
│  │ GET /{tenant}/keys      │   │ • Choose Mock Identity   │   │ • RS256 JWT ID & Access Tokens         │  │
│  └─────────────────────────┘   │ • Auto-generate Auth Code│   │ • Full CORS Support enabled            │  │
│                                └──────────────────────────┘   └────────────────────────────────────────┘  │
│                                                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Embedded Management Web UI (Vite + TypeScript + Tailwind CSS)                                       │  │
│  │ • #config : Live Entra Authorize URL with 1-click Copy, MSAL.js Config Snippets, cURL Templates     │  │
│  │ • #users  : Mock User Directory CRUD (Alex Wilber, Megan Bowen, custom roles & token claims)        │  │
│  │ • #login  : In-browser PKCE Test Client, JWT Claims Inspector, JWKS Validator & Live Refresh Token   │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Microsoft Entra ID v2.0 Protocol Emulation

### 2.1 Supported Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/{tenant}/v2.0/.well-known/openid-configuration` | `GET` | Returns standard OpenID Connect discovery metadata customized for `{tenant}`. |
| `/{tenant}/discovery/v2.0/keys` | `GET` | Serves public RSA keys formatted in JSON Web Key Set (JWKS) format. |
| `/{tenant}/oauth2/v2.0/authorize` | `GET` | Serves interactive mock sign-in dialog or auto-authenticates if `login_hint` and `prompt=none` are passed. |
| `/{tenant}/oauth2/v2.0/token` | `POST` | Exchanges `authorization_code` (with PKCE verification) or `refresh_token`, issuing RS256-signed JWTs. |
| `/{tenant}/oauth2/v2.0/logout` | `GET` | Handles session termination and redirects to `post_logout_redirect_uri`. |

All IdP and API endpoints automatically include CORS headers:
```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, HEAD
Access-Control-Allow-Headers: Authorization, Content-Type, Accept, Origin, X-Requested-With, client_id
```

---

## 3. Frontend Integration Guide

### 3.1 Direct Browser Redirect (Session Generation)
Your frontend can initiate authentication by redirecting the user's browser to the authorize URL generated on the `#config` dashboard:

```text
http://localhost:8080/{tenant}/oauth2/v2.0/authorize
  ?client_id=<YOUR_CLIENT_ID>
  &response_type=code
  &redirect_uri=http://localhost:3000/callback
  &response_mode=query
  &scope=openid+profile+email+offline_access
  &state=12345
  &nonce=67890
  &code_challenge=<S256_HASH_OF_VERIFIER>
  &code_challenge_method=S256
```

When this URL is opened:
1. `local-sso` displays a mock Microsoft login screen where you select which user identity to authenticate as (e.g. `Alex Wilber` or `Megan Bowen`).
2. Upon selection, `local-sso` generates an authorization code and redirects back to `http://localhost:3000/callback?code=...&state=12345`.

### 3.2 MSAL.js / `@azure/msal-browser` Configuration
```typescript
import { PublicClientApplication, Configuration } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: "your-client-id",
    authority: "http://localhost:8080/common",
    knownAuthorities: ["localhost:8080"],
    redirectUri: "http://localhost:3000/callback",
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  }
};

export const msalInstance = new PublicClientApplication(msalConfig);
```

---

## 4. Token & Claims Specification

Tokens issued by `local-sso` are signed with an internal **RS256 2048-bit RSA key pair** and match Microsoft Entra ID v2.0 token claims:

### 4.1 Sample ID Token (`id_token`) Payload
```json
{
  "iss": "https://login.microsoftonline.com/common/v2.0",
  "sub": "sub-alex-wilber-001",
  "aud": "your-client-id",
  "exp": 1728243600,
  "nbf": 1728240000,
  "iat": 1728240000,
  "oid": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
  "tid": "72f988bf-86f1-41af-91ab-2d7cd011db47",
  "preferred_username": "alexw@contoso.onmicrosoft.com",
  "name": "Alex Wilber",
  "given_name": "Alex",
  "family_name": "Wilber",
  "email": "alexw@contoso.onmicrosoft.com",
  "roles": [
    "Global Administrator",
    "User"
  ],
  "groups": [
    "Engineers",
    "Admins"
  ],
  "ver": "2.0"
}
```

---

## 5. Mock User Directory & Custom Claims

`local-sso` includes an in-memory user directory with REST APIs:

- `GET /api/users` — List all mock users
- `POST /api/users` — Create a new mock user
- `GET /api/users/{id}` — Retrieve mock user by ID or email
- `PUT /api/users/{id}` — Update user claims and roles
- `DELETE /api/users/{id}` — Remove mock user

You can configure mock users via the UI at `http://localhost:8080/#users`.

---

## 6. Single Binary Architecture

The embedded web UI is compiled using Vite, TypeScript, and Tailwind CSS. The production assets (`web/dist`) are embedded directly into the Go binary using `//go:embed all:web`.

Running `go build -o local-sso .` produces a self-contained executable that serves the IdP server, REST APIs, and the modern UI dashboard with zero external runtime dependencies.
