# sso-local

> **A single-binary developer tool that runs a Local Mock Microsoft Entra ID (OIDC) Identity Provider & In-App SSO Test Playground.**

`sso-local` eliminates the friction of creating Azure/Entra app registrations and enterprise tenant configurations during local development. It runs a zero-dependency local OAuth2 / OpenID Connect server on `http://127.0.0.1:8080` that emits Microsoft Entra v2.0-compatible tokens, serves standard discovery and JWKS endpoints, and provides a modern embedded web UI (built with TypeScript & Tailwind CSS) to manage mock users, copy frontend integration URLs, and test authentication flows right inside the browser.

---

## 🚀 How to Build & Run

The entire web frontend is embedded inside the Go binary (`//go:embed all:web`). At runtime, you only need the single binary file with **zero external dependencies**.

### 1. One-Command Build

#### In WSL / Linux:
```bash
./build.sh
```

#### In Windows PowerShell:
```powershell
.\build.ps1
```

---

### 2. Manual Step-by-Step Build

```bash
# Step 1: Build the frontend (TypeScript + Tailwind CSS)
cd web && npm install && npm run build && cd ..

# Step 2: Build the standalone Go binary
go build -o sso-local .
```

*(To build a native Windows `.exe` executable from WSL: `GOOS=windows GOARCH=amd64 go build -o sso-local.exe .`)*

---

### 3. Running the Server

#### In WSL / Linux:
```bash
./sso-local -port 8080
```

#### In Windows PowerShell:
```powershell
wsl ./sso-local -port 8080
# or .\sso-local.exe -port 8080
```

#### Available CLI Flags:
| Flag | Default | Description | Example |
|---|---|---|---|
| `-port` | `8080` | Port to listen on (`127.0.0.1:<port>`) | `./sso-local -port 3000` |
| `-tenant` | `common` | Default tenant alias or GUID | `./sso-local -tenant my-tenant-id` |
| `-no-browser` | `false` | Run without auto-opening the browser | `./sso-local -no-browser` |

---

## 🧪 Testing Inside This App Itself

`sso-local` includes a built-in interactive test suite so you can verify OAuth2 / OIDC authentication flows and token generation without writing any frontend code first:

1. **Open the Test Client**:
   Navigate to [`http://127.0.0.1:8080/#login`](http://127.0.0.1:8080/#login).
2. **Configure Test Parameters**:
   * Select which Mock User to sign in as (e.g. `Alex Wilber`, `Megan Bowen`, or interactive account picker).
   * Customize requested OAuth scopes (e.g. `openid profile email offline_access User.Read`).
   * Choose prompt behavior (`select_account`, `none`, or `consent`).
3. **Execute Flow**:
   Click **"🚀 Launch OAuth2 + PKCE Test Flow"**.
   * It performs the full RFC 7636 Authorization Code + PKCE (S256) flow against the local server.
   * Redirects to the local interactive sign-in prompt and exchanges the code at `/oauth2/v2.0/token`.
4. **Live Token & Claims Inspector**:
   * **Visual User Profile**: Inspects `name`, `email`, `tid`, `oid`, and `roles`.
   * **JOSE Header & Decoded Claims**: Formatted JSON trees for ID token and Access token.
   * **🛡️ Verify JWKS Signature**: Live one-click RS256 cryptographic verification against the local JWKS endpoint.
   * **🔄 Test Token Refresh**: Live one-click token refresh using `grant_type=refresh_token`.
   * **cURL Generator**: Copyable command with `Authorization: Bearer <token>` for testing your backend APIs.

---

## 🌐 Consuming `sso-local` in Your Frontend App

### Option A: Direct Browser Redirect for Session Generation
Copy the pre-assembled Microsoft Entra authorize URL from the `#config` dashboard:

```text
http://127.0.0.1:8080/common/oauth2/v2.0/authorize?client_id=00000000-0000-0000-0000-000000000001&response_type=code&redirect_uri=http://localhost:3000/callback&response_mode=query&scope=openid+profile+email+offline_access&state=12345&nonce=67890&code_challenge=...&code_challenge_method=S256
```

1. Clicking "Login" in your frontend redirects the user to this URL.
2. `sso-local` displays the interactive mock sign-in prompt where you select a mock user (e.g. `Alex Wilber`).
3. It redirects back to your frontend's `redirect_uri` with `?code=...&state=...`.
4. Your frontend exchanges the code at `POST http://127.0.0.1:8080/common/oauth2/v2.0/token`.

---

### Option B: MSAL.js / `@azure/msal-browser` Integration
Configure your MSAL application instance to point to `sso-local`:

```typescript
import { PublicClientApplication, Configuration } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: "your-client-id",
    authority: "http://127.0.0.1:8080/common",
    knownAuthorities: ["127.0.0.1:8080"],
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

## 📋 Endpoints Reference

All endpoints support full CORS (`Access-Control-Allow-Origin: *`):

| Endpoint | Method | Purpose |
|---|---|---|
| `/{tenant}/v2.0/.well-known/openid-configuration` | `GET` | OpenID Connect Discovery Metadata |
| `/{tenant}/discovery/v2.0/keys` | `GET` | JWKS endpoint serving RS256 RSA public key |
| `/{tenant}/oauth2/v2.0/authorize` | `GET` | Interactive Mock Sign-in / Authorization Code prompt |
| `/{tenant}/oauth2/v2.0/token` | `POST` | Exchanges `authorization_code` (PKCE S256) or `refresh_token` |
| `/{tenant}/oauth2/v2.0/logout` | `GET` | Session sign-out and post-logout redirect |
| `/#config` | `GET` | Web Dashboard with copyable URLs & integration snippets |
| `/#users` | `GET` | Mock User Directory management UI |
| `/#login` | `GET` | In-browser Test Client & Token Inspector |

---

## 👥 Mock User Directory

`sso-local` comes pre-configured with realistic Microsoft personas:
* **Alex Wilber** (`alexw@contoso.onmicrosoft.com`) — Global Administrator
* **Megan Bowen** (`meganb@contoso.onmicrosoft.com`) — Application Developer
* **Adele Vance** (`adelev@contoso.onmicrosoft.com`) — Security Auditor

You can create, edit, or delete custom users and custom token claims anytime via `http://127.0.0.1:8080/#users`.

---

## 🧪 Unit Testing

Run all unit tests:
```bash
go test -v ./...
```

---

## 🔒 Security Notice

`sso-local` binds exclusively to `127.0.0.1` (loopback) and is strictly intended for local software development and testing. Do not expose this service to public networks.
