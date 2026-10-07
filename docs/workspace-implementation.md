# Implementing sso-local (Mock Entra IdP) into a Next.js + Better Auth App

> This file is the **source of truth** for wiring `sso-local` (the mock Microsoft Entra ID OIDC IdP in this repo) into a **pnpm Next.js app that already has a mock API + webapp**. Read it end-to-end before writing any code. It is written so another AI agent can implement it without further research.

---

## 1. What sso-local actually is (read this first)

`sso-local` is a **single Go binary** that runs three things on **one port** (default `8080`):

1. A **mock Microsoft Entra ID / OIDC Identity Provider** (`authorize`, `token`, `logout`, OIDC discovery, JWKS).
2. A **mock user directory REST API** (`/api/users` CRUD) + an interactive sign-in picker.
3. An **embedded management UI** (`/#config`, `/#users`, `/#login`).

Everything you need for this task lives behind a single origin:

| What | URL (dev via `./run.sh`, port `8080`) |
|---|---|
| OIDC discovery | `http://localhost:8080/{tenant}/v2.0/.well-known/openid-configuration` |
| Authorize | `http://localhost:8080/{tenant}/oauth2/v2.0/authorize` |
| Token | `http://localhost:8080/{tenant}/oauth2/v2.0/token` |
| Logout | `http://localhost:8080/{tenant}/oauth2/v2.0/logout` |
| JWKS | `http://localhost:8080/{tenant}/discovery/v2.0/keys` |
| Mock users CRUD | `http://localhost:8080/api/users` (+ `/api/users/{id}`) |
| UI | `http://localhost:8080/#config` |

`{tenant}` is one of `common` | `organizations` | `consumers` | `<tenant-guid>` (default `common`).

Key behavioural facts (verified in source — do not re-derive):

- **No client allow-list / no client registration.** Any `client_id` + `redirect_uri` string pair works. It only validates that the token request's `redirect_uri` / `client_id` byte-match the authorize request. → Do **not** "register" the app anywhere.
- **No client secret check.** The token endpoint ignores `client_secret`. Send a placeholder (`"secret"`) if your client requires one.
- **PKCE required by default.** If you send `code_challenge`, you MUST send the matching `code_verifier` at the token endpoint, or you get `invalid_grant: code_verifier is required for PKCE`. Use `S256`.
- **The issuer is fake-but-validated.** Tokens are signed RS256 with `iss` = `https://login.microsoftonline.com/{tenant}/v2.0`, but the signing keys are local and published at `http://localhost:8080/{tenant}/discovery/v2.0/keys`. So Better Auth's discovery-based ID-token verification works.
- **Authorization codes:** single-use, 5-minute TTL. Never share them.
- **The authorize flow is interactive.** `GET /authorize` renders a mock Microsoft sign-in page listing mock users; picking one redirects to `redirect_uri?code=...&state=...`. If you send `prompt=none` + `login_hint=<email>`, it auto-authenticates (no picker).
- **User email is present** in the ID token (`email`, `preferred_username`) because mock users always carry one. You still anchor accounts on `oid` (stable) per Microsoft guidance.
- **`email_verified` is NOT emitted.** sso-local's ID tokens don't include an `email_verified` claim, so Better Auth will treat the email as **unverified** and (depending on config) block session creation. Plan for this (Section 7).

How to run it (see `run.sh`):

```bash
./run.sh                                   # everything on http://localhost:8080 (UI + API + OIDC)
PORT=3000 ./run.sh                         # or pin the single public port
```

`run.sh` starts an internal Go IdP (auto-picked port `8081-8100`) and a Vite proxy that serves the UI + `/api/*` + `/{tenant}/*` on the single public port. `Ctrl+C` stops both. You can also run the compiled binary directly: `./sso-local -port 8080 -tenant common -no-browser`.

> The sso-local `web/` app and the Vite dev-server are **its own playground**, not the app you're integrating. Your Next.js app lives outside this repo.

---

## 2. Target architecture (what you're building)

```
browser (your Next.js app)
  │  signIn.social({ provider: "sso-local" })
  ▼
your mock API (Next.js route handler / API route)
  │  GET /api/auth/sign-in/sso-local
  │     - PKCE verifier + state stored server-side (or DB)
  │     - redirect 302 to sso-local authorize endpoint
  ▼
sso-local (http://localhost:8080/common/oauth2/v2.0/authorize)
  │  interactive mock sign-in picker  ->  code + state
  ▼
GET {your_callback}?code=...&state=...
  │  your mock API (Better Auth /callback/sso-local)
  │     - exchange code for tokens (POST sso-local token endpoint)
  │     - verify id_token against sso-local JWKS
  ▼
session created in your app (cookie / DB)
```

Both sso-local and your Next.js app run on `localhost`. sso-local has **full CORS** (`Access-Control-Allow-Origin: *`), so browser-side fetches work too.

---

## 3. Port & URL matrix (pick ONE, use everywhere)

Pick the ports up front so `redirect_uri` strings are byte-identical everywhere (mismatches are the #1 error):

| Thing | Default | Your value |
|---|---|---|
| sso-local (IdP) | `http://localhost:8080` | `http://localhost:8080` |
| Your Next.js app | `http://localhost:3000` | `http://localhost:3000` |
| Better Auth base URL | — | `http://localhost:3000` |
| Authorize URL | — | `http://localhost:8080/common/oauth2/v2.0/authorize` |
| Token URL | — | `http://localhost:8080/common/oauth2/v2.0/token` |
| Discovery URL | — | `http://localhost:8080/common/v2.0/.well-known/openid-configuration` |
| JWKS URI | — | `http://localhost:8080/common/discovery/v2.0/keys` |
| OAuth callback URI (provider) | — | `http://localhost:3000/api/auth/callback/sso-local` |
| Client ID | `00000000-0000-0000-0000-000000000001` | same |
| Client Secret | (ignored by sso-local) | `"mock-secret"` (placeholder) |
| Scope | — | `openid profile email` (no `offline_access` needed unless you want refresh tokens) |

> **Callback path note:** Better Auth's Generic OAuth plugin calls the provider's redirect URI `${baseURL}/api/auth/callback/:providerId` by default (the `:providerId` param is required and must match). Configure `redirectURI` explicitly as `http://localhost:3000/api/auth/callback/sso-local`.

---

## 4. Server-side auth config (your Next.js app)

Use Better Auth's **Generic OAuth plugin** with a **manual provider config** (the `microsoftEntraId` helper hard-codes `login.microsoftonline.com`, so it can't target the local IdP — do NOT use it here).

The discovery approach is recommended because it lets Better Auth auto-discover endpoints and verify the ID token's signature/issuer/audience against sso-local's local JWKS.

```ts
// lib/auth.ts
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET!,
  socialProviders: {}, // not used; we go through genericOAuth
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "sso-local",
          clientId: "00000000-0000-0000-0000-000000000001",
          clientSecret: "mock-secret", // ignored by sso-local, required for confidential-client token auth
          discoveryUrl: "http://localhost:8080/common/v2.0/.well-known/openid-configuration",
          redirectURI: "http://localhost:3000/api/auth/callback/sso-local",
          scopes: ["openid", "profile", "email"],
          // pkce defaults to true; sso-local requires it. Leave it on.
          // accountSubject defaults to verified `sub`; mock users have stable `sub`. Optional:
          // accountSubject: ({ profile }) => (profile.oid as string) ?? (profile.sub as string),
        },
      ],
    }),
  ],
});
```

**What to check after wiring the config:**

1. Better Auth fetches the discovery document at startup. Confirm it parses sso-local's document: it advertises `issuer`, `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `end_session_endpoint`, `code_challenge_methods_supported: ["S256","plain"]`, and `id_token_signing_alg_values_supported: ["RS256"]`. sso-local's document omits `userinfo_endpoint` — that's fine, Generic OAuth reads profile from the verified `id_token` (and falls back to `/api/verify`-style claims), it does not require userinfo.
2. If Better Auth's ID-token validation compares `iss` strictly against the discovery issuer, note sso-local issues `iss=https://login.microsoftonline.com/common/v2.0` while its discovery doc publishes the same value — match is exact.

### Fallback: explicit endpoints (no discovery)

If discovery-based startup is ever flaky, provide explicit endpoints (equivalent):

```ts
{
  providerId: "sso-local",
  clientId: "00000000-0000-0000-0000-000000000001",
  clientSecret: "mock-secret",
  authorizationUrl: "http://localhost:8080/common/oauth2/v2.0/authorize",
  tokenUrl: "http://localhost:8080/common/oauth2/v2.0/token",
  endSessionEndpoint: "http://localhost:8080/common/oauth2/v2.0/logout",
  redirectURI: "http://localhost:3000/api/auth/callback/sso-local",
  scopes: ["openid", "profile", "email"],
}
```

Note: explicit-endpoint providers do **not** support the client-obtained `id_token` sign-in path and do **not** get ID-token signature verification from discovery — they rely on the token endpoint's `id_token` only.

### Refresh tokens (optional)

If you want refresh tokens, add `offline_access` to `scopes` **and** set `accessType: "offline"`. sso-local returns a fake `refresh_token` and supports `grant_type=refresh_token` at the token endpoint.

---

## 5. Client-side sign-in (your Next.js app)

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ baseURL: "http://localhost:3000" });

// trigger the flow
await authClient.signIn.social({
  provider: "sso-local",
  callbackURL: "/dashboard",
});
```

That's it — Better Auth builds the authorize URL (state + PKCE `S256` + `redirect_uri`), and sso-local redirects to its mock picker. No manual PKCE/state handling in your code.

Optional: preselect a mock user and skip the picker by forwarding `prompt` and `login_hint`:

```ts
await authClient.signIn.social({
  provider: "sso-local",
  callbackURL: "/dashboard",
  additionalParams: {
    prompt: "none",
    login_hint: "alexw@contoso.onmicrosoft.com", // any mock user email from /#users
  },
});
```

### Mock user directory

Users are managed via `http://localhost:8080/#users` or the REST API:
`GET /api/users`, `POST /api/users`, `PUT /api/users/{id}`, `DELETE /api/users/{id}`. Seed a couple (e.g. Alex Wilber, Megan Bowen) so the picker isn't empty. ID-token claims reflect the selected mock user: `sub`, `oid`, `tid`, `name`, `given_name`, `family_name`, `preferred_username`, `email`, `roles`, `groups`.

---

## 6. What the callback should look like end-to-end

1. User clicks sign-in → browser redirected to `http://localhost:8080/common/oauth2/v2.0/authorize?...` (with `state`, `nonce`, `code_challenge`).
2. sso-local shows the mock picker. User selects a mock identity → sso-local stores a code bound to `(client_id, redirect_uri, code_challenge, nonce, scope, user)` and 302s to `http://localhost:3000/api/auth/callback/sso-local?code=oa.<...>&state=<...>`.
3. Better Auth (server) exchanges: `POST http://localhost:8080/common/oauth2/v2.0/token` with `grant_type=authorization_code`, `code`, `redirect_uri` (= callback URL), `client_id`, `code_verifier`, and `client_secret` (ignored).
4. sso-local verifies code (single-use, TTL 5 min), PKCE verifier, `client_id` and `redirect_uri` match → issues `access_token`, `id_token`, optional `refresh_token`.
5. Better Auth verifies the `id_token` (RS256 signature vs `http://localhost:8080/common/discovery/v2.0/keys`, issuer, audience) → maps profile → creates/links user → issues your app session → redirects to `callbackURL`.

Token response shape (what sso-local returns — matches standard):

```json
{
  "token_type": "Bearer",
  "scope": "openid profile email",
  "expires_in": 3600,
  "ext_expires_in": 3600,
  "access_token": "eyJ...",
  "id_token": "eyJ...",
  "refresh_token": "rt.eyJ1c2VyX2lkIjoidXNlci0xIg..."
}
```

ID-token claims (what Better Auth receives):

```json
{
  "iss": "https://login.microsoftonline.com/common/v2.0",
  "sub": "sub-alex-wilber-001",
  "aud": "00000000-0000-0000-0000-000000000001",
  "exp": 1770000000, "nbf": 1769996400, "iat": 1769996400,
  "oid": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
  "tid": "72f988bf-86f1-41af-91ab-2d7cd011db47",
  "name": "Alex Wilber",
  "given_name": "Alex", "family_name": "Wilber",
  "preferred_username": "alexw@contoso.onmicrosoft.com",
  "email": "alexw@contoso.onmicrosoft.com",
  "roles": ["Global Administrator", "User"],
  "groups": ["Engineers", "Admins"],
  "nonce": "<echoed from authorize request>",
  "ver": "2.0"
}
```

---

## 7. Gotchas you WILL hit (handle before testing)

1. **`redirect_uri` mismatch** (`invalid_grant: redirect_uri mismatch`) — the callback URL string must be byte-identical between the authorize request, your provider `redirectURI`, and the token exchange. Use exactly `http://localhost:3000/api/auth/callback/sso-local`. Never mix `localhost` and `localhost`.
2. **PKCE**: `pkce` must stay enabled (default). sso-local rejects a `code_verifier` that doesn't hash to the `code_challenge` (S256).
3. **`email_verified` is absent** → Better Auth treats the email as unverified. Two options:
   - Map `emailVerified: true` in the provider config so the mock user can log in without email verification (`mapProfileToUser` cannot set `emailVerified`; it maps mutable fields). Preferred for a mock: set Better Auth's `emailVerification` to not require verified emails, **or**
   - Accept that the flow redirects with `?error=email_not_verified`. For a dev/mock IdP, the least-friction route is allowing unverified emails in local config.
4. **Do not use `microsoftEntraId` helper** — it pins URLs to `https://login.microsoftonline.com/{tenantId}` and validates `tenantId` is a GUID. Use the manual generic config above (local endpoints).
5. **No allow-list on sso-local** — any `client_id` works; keep `client_id` identical across authorize/token or you get `client_id mismatch`.
6. **Codes are single-use + 5-min TTL** — a retry of the callback with the same `code` fails with `invalid_grant: authorization code not found or already used`.
7. **sso-local discovery omits `userinfo_endpoint`** — Generic OAuth builds the profile from the verified `id_token`; don't try to add a userinfo URL (there isn't one). If you need extra profile fields, extend mock user `custom_claims` (they're copied into the ID token).
8. **Running on one origin** — sso-local is CORS-open (`*`), so browser-side `fetch` against `http://localhost:8080/api/*` works; but the OAuth redirect flow should be driven server-side by Better Auth (cookie-session), not by a browser token exchange.
9. **Port collisions** — if `8080` is busy, run `PORT=8090 ./run.sh` and change every URL above. `redirect_uri` hostname must match the host your Next.js app runs on (`localhost` vs `localhost`).
10. **Better Auth requires an email on the user record** — mock users always have one, so no placeholder logic is needed.

---

## 8. Verification checklist (run after implementing)

```bash
# 1. sso-local up
./run.sh                                    # then open http://localhost:8080/#config

# 2. Discovery parses
curl -s http://localhost:8080/common/v2.0/.well-known/openid-configuration | jq .issuer
# -> "https://login.microsoftonline.com/common/v2.0"

# 3. JWKS reachable
curl -s http://localhost:8080/common/discovery/v2.0/keys | jq '.keys[0].alg'
# -> "RS256"

# 4. Mock users exist (or seed them via /#users)
curl -s http://localhost:8080/api/users | jq '.[0].email'

# 5. Better Auth server boots and registers the provider (check logs for discovery fetch)

# 6. Manual code-exchange smoke test (optional, replaces browser picker)
CODE="$(curl -s 'http://localhost:8080/common/oauth2/v2.0/authorize?client_id=00000000-0000-0000-0000-000000000001&redirect_uri=http://localhost:3000/api/auth/callback/sso-local&response_type=code&scope=openid%20profile%20email' | grep -oP 'code=\K[^"&]+' | head -1)"
# -> opens interactive picker; easier to test via UI

# 7. Sign in from the Next.js app:
#    /sign-in button -> sso-local picker -> back to /api/auth/callback/sso-local?code=...&state=...
#    -> cookie session -> redirect to callbackURL. Confirm session user.email == mock user email.
```

Manual end-to-end check with cURL (only after the interactive flow is proven):

```bash
VERIFIER="$(openssl rand -base64 48 | tr -d '=+/' | head -c 64)"
CHALLENGE="$(printf '%s' "$VERIFIER" | openssl dgst -binary -sha256 | base64 | tr '+/' '-_' | tr -d '=')"
# 1) open authorize URL in a browser (interactive picker):
#    http://localhost:8080/common/oauth2/v2.0/authorize?client_id=00000000-0000-0000-0000-000000000001&response_type=code&redirect_uri=http://localhost:3000/api/auth/callback/sso-local&scope=openid+profile+email&code_challenge=$CHALLENGE&code_challenge_method=S256&state=test&nonce=test
# 2) copy the ?code=... from the callback URL
CODE="oa..."
curl -s -X POST http://localhost:8080/common/oauth2/v2.0/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=authorization_code&code=$CODE&redirect_uri=http://localhost:3000/api/auth/callback/sso-local&client_id=00000000-0000-0000-0000-000000000001&code_verifier=$VERIFIER" \
  | jq '{token_type, expires_in, id_token_iss: (.id_token | split(".")[1] | @base64d | fromjson | .iss)}'
```

---

## 9. Implementation plan for the integrating agent

1. **Run sso-local** (`./run.sh`) and confirm `http://localhost:8080/#config`, `/api/users`, discovery.
2. **Seed mock users** (via `/#users` or `POST /api/users`) so the picker has entries and claims (email, roles).
3. **In your pnpm Next.js app**, add Better Auth (if not present) and the `genericOAuth` plugin per Section 4 (manual config, `discoveryUrl` = local sso-local, `redirectURI` = `http://localhost:3000/api/auth/callback/sso-local`, providerId `sso-local`).
4. **Add the sign-in button** per Section 5 (`authClient.signIn.social({ provider: "sso-local", ... })`).
5. **Handle email-verified** per Section 7 (allow unverified in local dev, or force `emailVerified` via profile mapping).
6. **Wire the mock API**: your app's `/api/auth/*` handlers are the "mock API" consuming sso-local — Better Auth runs them server-side. Keep them proxied at `http://localhost:3000/api/auth`.
7. **Run the verification checklist** (Section 8) and the manual cURL exchange.
8. **Commit**: `docs/workspace-implementation.md` lives in the sso-local repo under `docs/`.

---

## 10. Reference: endpoint ↔ behaviour map (for debugging)

| sso-local endpoint | Method | Behaviour |
|---|---|---|
| `/{tenant}/v2.0/.well-known/openid-configuration` | GET | OIDC metadata; issuer is the fake `https://login.microsoftonline.com/{tenant}/v2.0`; endpoints are local |
| `/{tenant}/discovery/v2.0/keys` | GET | Local RS256 JWKS |
| `/{tenant}/oauth2/v2.0/authorize` | GET | Interactive mock picker; `prompt=none` + `login_hint` auto-auths |
| `/{tenant}/oauth2/v2.0/token` | POST | `authorization_code` (PKCE-validated) or `refresh_token` grant; returns RS256 JWTs |
| `/{tenant}/oauth2/v2.0/logout` | GET | `post_logout_redirect_uri` → 302; else static "signed out" page |
| `/api/users`, `/api/users/{id}` | CRUD | Mock user directory |
| `/api/verify` | POST | One-shot server-side ID-token validation (claims only, no session) |
| `/api/token`, `/api/discovery` | POST/GET | Relay proxies (browser SPA helpers, not needed for Better Auth server flow) |
