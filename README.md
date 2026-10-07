# sso-local

> **A single-binary developer tool that runs a Local Mock Microsoft Entra ID (OIDC) Identity Provider & In-App SSO Test Playground.**

Developed by **[Sazzad Sazib](https://github.com/sazzadsazib)** ([@sazzadsazib](https://github.com/sazzadsazib)).

`sso-local` eliminates the friction of creating Azure/Entra app registrations and enterprise tenant configurations during local development. It runs a zero-dependency local OAuth2 / OpenID Connect server on `http://localhost:8080` that emits Microsoft Entra v2.0-compatible tokens, serves standard discovery and JWKS endpoints, and provides a modern embedded web UI (TypeScript & Tailwind CSS, Vercel-style glassmorphism) to manage mock users, copy frontend integration URLs, and test authentication flows right inside the browser.

---

## 1. Build

The web frontend is embedded into the Go binary (`//go:embed all:web`). **Always build the frontend first**, otherwise the binary ships a stale/empty UI.

### Option A — One-command build

#### WSL / Linux / macOS:
```bash
./build.sh
```

#### Windows PowerShell:
```powershell
.\build.ps1
```

### Option B — Manual step-by-step

```bash
# Step 1: Build the frontend (TypeScript + Tailwind CSS) -> web/dist
cd web && npm install && npm run build && cd ..

# Step 2: Build the standalone Go binary
go build -o sso-local .
```

Cross-compile a native Windows `.exe` from WSL/macOS/Linux:
```bash
GOOS=windows GOARCH=amd64 go build -o sso-local.exe .
```

---

## 2. Run Locally (Serve)

### Option A — Run the built binary
```bash
./sso-local -port 8080            # Linux / macOS
wsl ./sso-local -port 8080        # Windows (from WSL)
.\sso-local.exe -port 8080        # Windows native .exe
```

#### Which prebuilt binary in `bin/` should I run?

`./build.sh` (default / `all`) writes cross-compiled binaries to `bin/`. Pick the one matching your OS and CPU:

| OS | CPU | Binary | How to check CPU |
|----|-----|--------|------------------|
| macOS | Apple Silicon (M1/M2/M3/M4) | `bin/sso-local-darwin-arm64` | `uname -m` → `arm64` |
| macOS | Intel | `bin/sso-local-darwin-amd64` | `uname -m` → `x86_64` |
| Linux | x86_64 (most PCs/servers) | `bin/sso-local-linux-amd64` | `uname -m` → `x86_64` |
| Linux | ARM 64-bit (Graviton, Raspberry Pi 4/5 64-bit) | `bin/sso-local-linux-arm64` | `uname -m` → `aarch64` |
| Linux | 32-bit x86 | `bin/sso-local-linux-386` | `uname -m` → `i686` |
| Linux | 32-bit ARM | `bin/sso-local-linux-arm` | `uname -m` → `armv7l` |
| Linux | RISC-V 64 | `bin/sso-local-linux-riscv64` | `uname -m` → `riscv64` |
| FreeBSD | x86_64 | `bin/sso-local-freebsd-amd64` | `uname -m` → `amd64` |
| Windows | x64 (most PCs) | `bin\sso-local-windows-amd64.exe` | PowerShell: `$env:PROCESSOR_ARCHITECTURE` → `AMD64` |
| Windows | ARM (Surface Pro X, Snapdragon) | `bin\sso-local-windows-arm64.exe` | PowerShell: `$env:PROCESSOR_ARCHITECTURE` → `ARM64` |

```bash
./bin/sso-local-darwin-arm64 -port 8080          # macOS (Apple Silicon)
./bin/sso-local-linux-amd64 -port 8080           # Linux x86_64
.\bin\sso-local-windows-amd64.exe -port 8080     # Windows x64 (PowerShell)
```

> macOS: if Gatekeeper blocks the binary, run `xattr -d com.apple.quarantine bin/sso-local-darwin-*` first.
> Linux/macOS: if you get "permission denied", run `chmod +x bin/sso-local-*`.

### Option B — `go install`, then serve from anywhere
```bash
# one-time: install the binary into $(go env GOPATH)/bin (run in the repo root,
# frontend must already be built so web/dist is embedded)
go install .

# serve (works from any directory, binary is on your PATH)
sso-local -port 8080
```

### Option C — Run from source (dev loop)
```bash
go run . -port 8080
```

### Option D — Development mode (UI + API on ONE port, hot reload)
```bash
./run.sh                  # everything on http://localhost:8080
PORT=3000 ./run.sh        # pick a different single port
GO_PORT=9091 ./run.sh     # pin the internal (auto-picked 8081-8100 otherwise)
```

One public port serves **everything** — open **`http://localhost:8080/#config`**:

| On port `PORT` (default 8080) | Routed to |
|---|---|
| `/` (UI, HMR) | Vite dev server |
| `/api/*`, `/callback` | proxied to the internal Go IdP |
| `/{tenant}/oauth2/*`, `/{tenant}/v2.0/*`, `/{tenant}/discovery/*` | proxied to the internal Go IdP |

* The Go IdP listens on an internal port (`localhost:8081+`, auto-picked, `GO_PORT` to pin) — the browser never talks to it directly, so `window.location.origin` based redirect URLs stay on the single public port.
* Discovery documents advertise the public `host:port` they were requested on (Go reads the `Host` header through the proxy), so `authorization_endpoint` / `token_endpoint` / `jwks_uri` all point at `http://localhost:8080/...`.
* Edit anything under `web/src/**` and the page hot-reloads — no `npm run build`, no `go build`.
* The Go server is compiled to `.dev/sso-local-dev` (git-ignored) before starting, so a compile error stops the run immediately instead of serving a stale binary.
* `Ctrl+C` stops **both** processes.

> Rebuild the embedded UI (`./build.sh`) only for the production binary — in dev mode the UI comes from Vite and `web/dist` is not served.

### Environment configuration (`.env`)

```bash
cp .env.example .env   # then edit the values
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Public port serving UI + API + OIDC (what you open) |
| `GO_PORT` | auto (`8081`-`8100`) | Internal loopback port for the Go IdP, proxied by Vite |
| `SSO_BACKEND` | `http://localhost:$GO_PORT` | Vite proxy target (only override for an external Go server) |
| `TENANT` | `common` | Default tenant alias or GUID passed to `sso-local -tenant` |

`./run.sh` loads `.env` automatically; variables already exported in your shell win over the file.

On startup the server binds to `localhost` only and prints:

```
================================================================
  sso-local — Local Mock Microsoft Entra ID (OIDC) & SSO Playground
================================================================
  -> Web Dashboard:    http://localhost:8080/#config
  -> Mock Users:       http://localhost:8080/#users
  -> Test Client:      http://localhost:8080/#login
  -> OIDC Discovery:   http://localhost:8080/common/v2.0/.well-known/openid-configuration
  -> Authorize URL:    http://localhost:8080/common/oauth2/v2.0/authorize
  -> Token URL:        http://localhost:8080/common/oauth2/v2.0/token
  -> JWKS Keys URL:    http://localhost:8080/common/discovery/v2.0/keys
================================================================
```

### Available CLI flags

| Flag | Default | Description | Example |
|---|---|---|---|
| `-port`, `-p` | `8080` | Port to listen on (`localhost:<port>`) | `sso-local -p 3000` |
| `-tenant`, `-t` | `common` | Default tenant alias or GUID | `sso-local -t my-tenant-id` |
| `-base-url`, `-b` | `""` | Override base URL for OIDC metadata (e.g. ngrok/tunnels) | `sso-local -b https://xxxx.ngrok-free.app` |
| `-issuer-mode` | `host` | Issuer format: `host` (default) or `entra` | `sso-local -issuer-mode entra` |
| `-no-browser` | `false` | Do not auto-open the browser | `sso-local -no-browser` |

### Stop the server
`Ctrl+C` (graceful shutdown with a 5s timeout).

---

## 3. Use It In Your Frontend

### Step 1 — Start `sso-local`
```bash
./sso-local -port 8080
```

### Step 2 — Update the redirect URL (client config)

Open the dashboard at [`http://localhost:8080/#config`](http://localhost:8080/#config) and edit the active **Profile Settings**:

| Field | Meaning | Example |
|---|---|---|
| `Client ID` | Any value works (mock IdP, no app registration) | `00000000-0000-0000-0000-000000000001` |
| `Redirect URI` | **Your frontend's callback route** — this is where the auth code is sent | `http://localhost:3000/callback` |
| `Tenant` | Alias or GUID used in every URL | `common` or `72f988bf-86f1-41af-91ab-2d7cd011db47` |
| `Host Origin / Base URL` | Custom host origin for ngrok tunnels or remote testing | `https://xxxx.ngrok-free.app` or `http://localhost:8080` |
| `OIDC Issuer Format` | Format for `iss` claim and discovery (`host` origin or `entra`) | `Host Origin ({host}/{tenant}/v2.0)` |
| `Scope` | Space-separated scopes | `openid profile email offline_access` |

> **Important:** The **same** `redirect_uri` and `client_id` must be used in the authorize request **and** in the token exchange, otherwise the code exchange fails with `invalid_grant`.
> **Ngrok Tunnel Support:** When running `ngrok http 8080`, simply set `Host Origin / Base URL` to your ngrok URL (`https://...ngrok-free.app`). All endpoints, cURL commands, and MSAL snippets will immediately update to your ngrok origin. The Go backend automatically parses `X-Forwarded-Proto` and `X-Forwarded-Host` headers as well.

Copy the pre-assembled **Authorize URL** from the `#config` banner:

```text
http://localhost:8080/common/oauth2/v2.0/authorize?client_id=00000000-0000-0000-0000-000000000001&response_type=code&redirect_uri=http://localhost:3000/callback&response_mode=query&scope=openid+profile+email+offline_access&state=12345&nonce=67890&code_challenge=...&code_challenge_method=S256
```

### Step 3 — Authorize the app (sign the user in)

1. Redirect the user's browser to the authorize URL above (login button in your app).
2. `sso-local` shows the **interactive mock sign-in prompt** — pick a mock user (e.g. `Alex Wilber`).
3. The browser is redirected back to your `redirect_uri` with `?code=...&state=...`.

> There is nothing to register in Azure: any `client_id` / `redirect_uri` is accepted by the mock IdP. Just keep them identical between Step 2 and Step 4.

### Step 4 — Exchange the code (point your app at the mock token API)

**A. Direct token endpoint** (server-side exchange, confidential or PKCE public client):

```bash
curl -X POST http://localhost:8080/common/oauth2/v2.0/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "client_id=00000000-0000-0000-0000-000000000001" \
  -d "redirect_uri=http://localhost:3000/callback" \
  -d "code=<CODE_FROM_CALLBACK>" \
  -d "code_verifier=<PKCE_VERIFIER>"
```

**B. Via the mock API proxy** (browser-side, CORS-friendly — use this from SPA/mocks):

```ts
const res = await fetch("http://localhost:8080/api/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token_url: "http://localhost:8080/common/oauth2/v2.0/token",
    client_id: "00000000-0000-0000-0000-000000000001",
    code: codeFromCallback,
    code_verifier: pkceVerifier,
    redirect_uri: "http://localhost:3000/callback",
  }),
});
const session = await res.json(); // access_token, id_token, refresh_token, ...
```

`/api/token` also accepts `client_secret`, `refresh_token` (for `grant_type=refresh_token`), `scope`, `extra` and `client_id_in_query`.

### Step 5 — Verify tokens (optional)

```ts
await fetch("http://localhost:8080/api/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    id_token: session.id_token,
    jwks_uri: "http://localhost:8080/common/discovery/v2.0/keys",
    issuer: "https://login.microsoftonline.com/common/v2.0", // as reported by discovery
    audience: "00000000-0000-0000-0000-000000000001",
  }),
}); // -> { verified: true, claims: { ... } }
```

The `issuer` is always Entra-shaped (`https://login.microsoftonline.com/{tenant}/v2.0`) — read it from `GET /{tenant}/v2.0/.well-known/openid-configuration`.

### Full client snippets

**Plain OAuth2 + PKCE (any framework):**
```ts
const verifier  = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const challenge = btoa(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// 1. redirect to /common/oauth2/v2.0/authorize with code_challenge + code_challenge_method=S256
// 2. read ?code= from the callback
// 3. POST the code + verifier to /api/token (see Step 4B)
```

**MSAL.js / `@azure/msal-browser`:**
```typescript
import { PublicClientApplication, Configuration } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: "00000000-0000-0000-0000-000000000001",
    authority: "http://localhost:8080/common",
    knownAuthorities: ["localhost:8080"],
    redirectUri: "http://localhost:3000/callback",
  },
  cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false },
};

export const msalInstance = new PublicClientApplication(msalConfig);
```

> Keep `knownAuthorities` pointing at `localhost:8080` — MSAL otherwise rejects an unknown authority.

---

## 4. Mock API Reference (JSON helpers)

CORS is fully open (`Access-Control-Allow-Origin: *`) so these work straight from your frontend.

| Endpoint | Method | Purpose | Body / Query |
|---|---|---|---|
| `/api/token` | `POST` | Token exchange proxy (code for tokens, or refresh) | `token_url`, `client_id`, `code`, `code_verifier`, `redirect_uri` (+ optional `client_secret`, `refresh_token`, `scope`, `extra`, `client_id_in_query`) |
| `/api/verify` | `POST` | RS256 signature + claims validation of an ID token | `id_token`, `jwks_uri`, `issuer`, `audience` |
| `/api/discovery` | `GET` | Fetch/normalize any OIDC discovery document | `?issuer=` or `?url=` |
| `/api/users` | `GET` | List mock users | — |
| `/api/users` | `POST` | Create a mock user | `{ name, email, roles, ... }` |
| `/api/users/{id}` | `PUT` | Update a mock user | partial user JSON |
| `/api/users/{id}` | `DELETE` | Delete a mock user | — |
| `/api/idp/login` | `POST` | Submit the mock sign-in form (used by the authorize prompt) | form fields |
| `/api/version` | `GET` | Running version info | — |

---

## 5. OIDC Endpoints Reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/{tenant}/v2.0/.well-known/openid-configuration` | `GET` | OpenID Connect Discovery Metadata |
| `/{tenant}/discovery/v2.0/keys` | `GET` | JWKS endpoint serving the RS256 public key |
| `/{tenant}/oauth2/v2.0/authorize` | `GET` | Interactive Mock Sign-in / Authorization Code prompt |
| `/{tenant}/oauth2/v2.0/token` | `POST` | Exchanges `authorization_code` (PKCE S256) or `refresh_token` |
| `/{tenant}/oauth2/v2.0/logout` | `GET` | Session sign-out and post-logout redirect |
| `/#config` | `GET` | Web Dashboard with copyable URLs & integration snippets |
| `/#users` | `GET` | Mock User Directory management UI |
| `/#login` | `GET` | In-browser Test Client & Token Inspector |

---

## 6. Testing Inside This App Itself

`sso-local` includes a built-in interactive test suite so you can verify OAuth2 / OIDC authentication flows and token generation without writing any frontend code first:

1. **Open the Test Client**: navigate to [`http://localhost:8080/#login`](http://localhost:8080/#login).
2. **Configure Test Parameters**:
   * Select which Mock User to sign in as (e.g. `Alex Wilber`, `Megan Bowen`, or the interactive account picker).
   * Customize requested OAuth scopes (e.g. `openid profile email offline_access User.Read`).
   * Choose prompt behavior (`select_account`, `none`, or `consent`).
3. **Execute Flow**: click **"Launch OAuth2 + PKCE Test Flow"**.
   * It performs the full RFC 7636 Authorization Code + PKCE (S256) flow against the local server.
   * Redirects to the local interactive sign-in prompt and exchanges the code at `/oauth2/v2.0/token`.
4. **Live Token & Claims Inspector**:
   * **Visual User Profile**: inspects `name`, `email`, `tid`, `oid`, and `roles`.
   * **JOSE Header & Decoded Claims**: formatted JSON trees for ID token and Access token.
   * **Verify JWKS Signature**: one-click RS256 cryptographic verification against the local JWKS endpoint.
   * **Test Token Refresh**: one-click token refresh using `grant_type=refresh_token`.
   * **cURL Generator**: copyable command with `Authorization: Bearer <token>` for testing your backend APIs.

---

## 7. Mock User Directory

`sso-local` comes pre-configured with default seed users:

* **Sazzad Sazib** (`sazib@gmail.com`) — Global Administrator
* **Iftekhar Rifat** (`rifat@gmail.com`) — Application Developer / Senior Software Engineer

Create, edit, or delete custom users and custom token claims anytime via `http://localhost:8080/#users` (backed by the `/api/users` endpoints).

---

## 8. Unit Testing

```bash
go test -v ./...
```

---

## Security Notice

`sso-local` binds exclusively to `localhost` (loopback) and is strictly intended for local software development and testing. Do not expose this service to public networks.
