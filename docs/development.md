# local-sso — Developer Guide & Internals

Welcome to the internal development guide for **`local-sso`**. This document provides an exhaustive reference for engineers developing, modifying, testing, and contributing to the `local-sso` codebase.

---

## 1. Project Philosophy & Core Principles

`local-sso` was built to eliminate the developer friction associated with setting up Azure / Microsoft Entra ID enterprise app registrations, tenant configurations, client secrets, and cloud permissions just to test local OAuth2 / OpenID Connect (OIDC) flows.

Key architectural tenets:

1. **Zero External Go Dependencies**: The backend uses **exclusively the Go standard library** (`net/http`, `crypto/rsa`, `crypto/sha256`, `crypto/rand`, `encoding/json`, `embed`, etc.). There is no dependency rot, no vulnerable third-party modules, and fast build times.
2. **Single Self-Contained Binary**: All web frontend assets (`web/dist`) are compiled and embedded directly into the Go executable via `//go:embed all:web/dist`. Distributing or running `local-sso` requires only one file.
3. **Dual Role**:
   - **Identity Provider (IdP)**: Emulates Microsoft Entra ID v2.0 endpoints (`.well-known/openid-configuration`, `authorize`, `token`, `keys`, `logout`) and standard OIDC extensions (`userinfo`) for external consumer applications (Next.js, React, Node, Python, MSAL.js, etc.).
   - **SSO Test Playground & Management UI**: Provides an in-browser suite to manage mock user identities, generate pre-configured authorize URLs, launch interactive PKCE test flows, inspect decoded JWT tokens, and cryptographically verify signatures against the local JWKS.
4. **Cloud & Proxy Transparent**: Works seamlessly on `localhost`, behind ngrok / localtunnels, inside Docker, and on cloud platforms like Render (`https://local-sso.onrender.com`).

---

## 2. API Specifications: Standard Entra vs. local-sso Extensions

To make local development and test automation as seamless as possible, `local-sso` implements both strict **Microsoft Entra ID v2.0 standard endpoints** and **convenience extensions** designed to ease mock integration.

### Summary Matrix

| Endpoint | Protocol Standard | Entra ID v2.0 Native? | Purpose |
|---|---|---|---|
| `/{tenant}/v2.0/.well-known/openid-configuration` | RFC 8414 / OIDC Core | ✅ Yes | Dynamic OpenID Connect Discovery metadata |
| `/{tenant}/discovery/v2.0/keys` | RFC 7517 (JWKS) | ✅ Yes | Public RSA-2048 signing keys for RS256 token verification |
| `/{tenant}/oauth2/v2.0/authorize` | RFC 6749 / Entra v2.0 | ✅ Yes | Interactive mock sign-in / authorization code prompt |
| `/{tenant}/oauth2/v2.0/token` | RFC 6749 / RFC 7636 | ✅ Yes | Authorization Code + PKCE (S256) and Refresh Token exchange |
| `/{tenant}/oauth2/v2.0/logout` | OIDC RP-Initiated | ✅ Yes | Session termination and post-logout redirect |
| `/{tenant}/oidc/userinfo`<br/>(also `/oidc/userinfo`) | RFC 5356 / OIDC Core | ❌ **Non-Standard Entra**<br/>(local-sso extension) | Standard OIDC UserInfo endpoint for claims retrieval |
| `/api/token` | REST JSON | ❌ **Non-Standard Entra**<br/>(local-sso helper) | CORS-friendly JSON token exchange proxy for SPAs |
| `/api/verify` | REST JSON | ❌ **Non-Standard Entra**<br/>(local-sso helper) | RS256 cryptographic signature and claims validator |
| `/api/discovery` | REST JSON | ❌ **Non-Standard Entra**<br/>(local-sso helper) | Discovery document proxy & normalizer |
| `/api/users` & `/api/users/{id}` | REST JSON | ❌ **Non-Standard Entra**<br/>(local-sso helper) | Programmatic Mock User Directory CRUD |
| `/api/version` & `/healthz` | REST JSON | ❌ **Non-Standard Entra**<br/>(local-sso helper) | Server health and build metadata |

---

### Detailed Specification of local-sso Mock Extensions

#### 1. OIDC UserInfo Endpoint: `GET|POST /{tenant}/oidc/userinfo`
- **Why this extension exists:**  
  Real Microsoft Entra ID v2.0 **does not provide a standard OpenID Connect `/userinfo` endpoint**. Microsoft expects applications to call the proprietary Microsoft Graph API (`https://graph.microsoft.com/v1.0/me`) or rely exclusively on the `id_token`.  
  However, generic OIDC client libraries (such as Better Auth, NextAuth / Auth.js, Passport.js, Spring Security, Python authlib) strictly require a `userinfo_endpoint` in the `.well-known/openid-configuration` metadata to populate session profiles.
- **Authentication:** `Authorization: Bearer <access_token>` or query parameter `?access_token=<token>`.
- **Response Format:**
  ```json
  {
    "sub": "00000000-0000-0000-0000-000000000001",
    "name": "Sazzad Sazib",
    "given_name": "Sazzad",
    "family_name": "Sazib",
    "preferred_username": "sazib@gmail.com",
    "email": "sazib@gmail.com",
    "email_verified": true,
    "tid": "72f988bf-86f1-41af-91ab-2d7cd011db47",
    "oid": "00000000-0000-0000-0000-000000000001",
    "roles": ["Admin", "User"],
    "groups": ["Engineering", "Leadership"]
  }
  ```
- **Note on `email_verified`:** Real Entra ID tokens often omit `email_verified`. `local-sso` explicitly returns `email_verified: true` in userinfo responses so downstream libraries do not reject account creation.

#### 2. Browser CORS Token Exchange Proxy: `POST /api/token`
- **Why this extension exists:**  
  Direct token endpoints (`/oauth2/v2.0/token`) require `application/x-www-form-urlencoded` and may encounter CORS blocks when triggered from single-page applications (SPAs) or in-browser mock sandboxes.
- **Request Body (JSON):**
  ```json
  {
    "token_url": "http://localhost:8080/common/oauth2/v2.0/token",
    "client_id": "00000000-0000-0000-0000-000000000001",
    "code": "auth-code-12345",
    "code_verifier": "pkce-verifier-string",
    "redirect_uri": "http://localhost:3000/callback"
  }
  ```
- **Response:** `200 OK` with JSON tokens (`access_token`, `id_token`, `refresh_token`, `expires_in`, `token_type: "Bearer"`) and full `Access-Control-Allow-Origin: *` headers.

#### 3. Cryptographic Signature & Claims Validator: `POST /api/verify`
- **Why this extension exists:**  
  Allows frontend integration tests, Playwright scripts, and the in-app playground to cryptographically verify RS256 token signatures against the local JWKS without implementing RSA algorithms in client code.
- **Request Body (JSON):**
  ```json
  {
    "id_token": "eyJhbGciOiJSUzI1NiIs...",
    "jwks_uri": "http://localhost:8080/common/discovery/v2.0/keys",
    "issuer": "http://localhost:8080/common/v2.0",
    "audience": "00000000-0000-0000-0000-000000000001"
  }
  ```
- **Response:**
  ```json
  {
    "verified": true,
    "claims": {
      "aud": "00000000-0000-0000-0000-000000000001",
      "iss": "http://localhost:8080/common/v2.0",
      "sub": "00000000-0000-0000-0000-000000000001",
      "email": "sazib@gmail.com",
      "name": "Sazzad Sazib",
      "roles": ["Admin", "User"]
    }
  }
  ```

#### 4. Programmatic Mock User Directory: `GET|POST|PUT|DELETE /api/users`
- **Why this extension exists:**  
  In real Entra ID, managing test personas requires Microsoft Graph API calls with tenant administrator credentials. `local-sso` exposes a simple REST API to seed test users, customize roles, and inject arbitrary claims into emitted tokens.
- **Endpoints:**
  - `GET /api/users`: List all mock accounts.
  - `POST /api/users`: Create a new mock persona.
  - `GET /api/users/{id}`: Fetch user by ID, email, or username.
  - `PUT /api/users/{id}`: Update mock user attributes and custom claims.
  - `DELETE /api/users/{id}`: Remove user persona.

#### 5. Headless Auto-Login: `prompt=none` + `login_hint`
- **Why this extension exists:**  
  In real Entra ID, `prompt=none` returns `interaction_required` unless a valid session cookie exists in the browser. In `local-sso`, passing `prompt=none&login_hint=sazib@gmail.com` **instantly authenticates and redirects with an authorization code** without displaying the account picker—enabling high-speed automated integration and E2E tests.

#### 6. Zero Client Registration & Secret Bypass
- Any `client_id` string is accepted.
- `client_secret` is completely ignored at the token endpoint (you can pass `"secret"` or omit it).
- Only requires that `client_id` and `redirect_uri` match between the authorize request and token request.

---

## 3. Prerequisites & Environment Setup

Ensure the following tools are installed on your workstation:

| Tool | Version Requirement | Purpose |
|---|---|---|
| **Go** | `1.22+` (tested with `1.22` – `1.24`) | Compiling the Go backend binary |
| **Node.js** | `20+` LTS | Compiling the TypeScript + Tailwind frontend |
| **npm** | `9+` / `10+` | Package management for `web/` |
| **Bash** or **PowerShell** | Standard | Running build scripts (`./build.sh`, `.\build.ps1`, `./run.sh`) |
| **Docker** *(optional)* | `20+` | Local container builds & multi-stage testing |

---

## 4. Repository Directory Structure

```
local-sso/
├── main.go                     # Application entrypoint: flags, port binding, browser launch, embed
├── go.mod                      # Go module definition (stdlib only, zero external deps)
├── Dockerfile                  # Multi-stage production container build (Node -> Go -> Alpine)
├── render.yaml                 # Infrastructure-as-code for Render deployment
├── build.sh                    # Bash script for frontend build & multi-arch cross-compilation
├── build.ps1                   # PowerShell equivalent for Windows environments
├── run.sh                      # Development orchestrator (single-port hot-reload runner)
├── .env.example                # Example environment variable configuration
├── bin/                        # Output folder for cross-compiled production binaries
├── docs/                       # Project documentation
│   ├── development.md          # THIS FILE: Developer guide, API spec, and dev workflows
│   ├── architecture.md         # Comprehensive architectural specification & RFC mapping
│   ├── IMPLEMENTATION.md       # Implementation notes and API reference
│   ├── workspace-implementation.md # Guide for integrating local-sso with Next.js & Better Auth
│   └── implementation-guide-for-mock-backend.md # Guide for mock backend setups
├── internal/                   # Private Go packages
│   ├── idp/                    # OpenID Connect / Identity Provider engine
│   │   ├── codes.go            # In-memory authorization code store with PKCE challenge & TTL
│   │   ├── discovery.go        # Dynamic .well-known/openid-configuration generator
│   │   ├── keys.go             # Ephemeral RSA-2048 keypair generation & JWKS JSON generation
│   │   ├── signer.go           # RS256 JWT signature engine & Entra v2.0 token claims builder
│   │   └── users.go            # Mock user directory, seed users, and in-memory CRUD store
│   ├── oauth/                  # OAuth2 / PKCE RFC primitives
│   │   ├── authorize.go        # Authorize URL query parsing & parameter validation
│   │   ├── jwtid.go            # Client-side JWT inspection & claims helper
│   │   ├── pkce.go             # RFC 7636 S256 verifier/challenge generation & validation
│   │   └── token.go            # Token exchange logic & response marshalling
│   └── server/                 # HTTP routing, middleware & handlers
│       ├── apitoken.go         # /api/token proxy endpoint for browser-safe CORS exchange
│       ├── api_users.go        # /api/users CRUD endpoints
│       ├── callback.go         # /callback receiver for built-in test client
│       ├── idp_authorize.go    # /{tenant}/oauth2/v2.0/authorize endpoint & HTML login UI
│       ├── idp_discovery.go    # /{tenant}/v2.0/.well-known/openid-configuration endpoint
│       ├── idp_keys.go         # /{tenant}/discovery/v2.0/keys (JWKS) endpoint
│       ├── idp_logout.go       # /{tenant}/oauth2/v2.0/logout endpoint
│       ├── idp_token.go        # /{tenant}/oauth2/v2.0/token exchange endpoint
│       └── server.go           # HTTP Multiplexer, CORS middleware, reverse proxy handler, static files
└── web/                        # Frontend Single Page Application (SPA)
    ├── package.json            # Vite, TypeScript, Tailwind CSS v4 dependencies
    ├── vite.config.ts          # Vite build & dev-server reverse proxy configuration
    ├── tsconfig.json           # TypeScript configuration
    ├── index.html              # HTML shell with Geist font & glassmorphism container
    ├── favicon.svg             # Project SVG icon
    └── src/                    # Frontend source code
        ├── main.ts             # SPA entrypoint, hash router, view rendering
        ├── api.ts              # API client for backend communication
        ├── style.css           # Global Tailwind CSS styles and glassmorphism utilities
        ├── components/         # UI components
        │   ├── navbar.ts       # Top navigation bar
        │   ├── toast.ts        # Dynamic toast notification system
        │   ├── modal.ts        # Reusable modal dialogues
        │   └── codeblock.ts    # Syntax-highlighted copyable code blocks
        └── views/              # View controllers
            ├── projects.ts     # Project profiles & integration configuration (#projects)
            ├── users.ts        # Mock user directory management (#users)
            ├── login.ts        # Interactive OAuth2 + PKCE test playground & claims inspector (#login)
            └── config.ts       # Legacy/standalone config view redirect
```

---

## 5. Development Workflows

### Option A — Hot Reload Dev Loop (Recommended): `./run.sh`

The `./run.sh` script provides a **single-port developer experience with hot reloading**:

```bash
./run.sh
```

#### How it works:
1. `run.sh` reads `.env` (or creates defaults) to configure `PORT=8080`.
2. It probes ports `8081-8100` to find an available internal port (e.g. `8081`).
3. It builds the Go backend into a temporary `.dev/local-sso-dev` binary.
4. It starts the internal Go backend on `127.0.0.1:8081`.
5. It launches the Vite dev server on the public port (`http://localhost:8080`), configured to proxy:
   - `/api/*` -> `http://127.0.0.1:8081/api/*`
   - `/{tenant}/*` -> `http://127.0.0.1:8081/{tenant}/*`
   - `/oidc/userinfo` -> `http://127.0.0.1:8081/oidc/userinfo`
   - `/callback` -> `http://127.0.0.1:8081/callback`
   - Everything else -> Vite SPA with Hot Module Replacement (HMR).
6. Pressing `Ctrl+C` gracefully terminates both processes.

---

### Option B — Run from Source: `go run .`

```bash
# 1. Ensure frontend is compiled
cd web && npm run build && cd ..

# 2. Run backend
go run . -port 8080
```

---

## 6. Building & Distribution

### Cross-Platform Build Script (`build.sh`)

`build.sh` produces stripped, static binaries for 10 target architectures:

```bash
# Build frontend and all target binaries into bin/
./build.sh

# Build only the binary for your local OS/CPU
./build.sh local
```

All binaries are compiled with:
- `CGO_ENABLED=0`: Zero dynamic C-library linking (runs on both `glibc` and `musl`).
- `-trimpath`: Strips local filesystem paths from stack traces.
- `-ldflags="-s -w"`: Strips debug symbols and DWARF tables to minimize binary size (~9MB).

---

## 7. Testing & Quality Assurance

### Go Unit Tests
```bash
go test -v ./...
```

### Frontend TypeScript Verification
```bash
cd web && npm run build
```

---

## 8. Security Notice

`local-sso` is strictly intended for **local software development and automated testing**. It does not enforce client secret authentication and issues self-signed RSA certificates. Do not use this tool as an identity provider in production environments.
