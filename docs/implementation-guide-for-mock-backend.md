# sso-local — Implementation Guide (mock backend)

The whole flow: **copy URL from Config → put it in your mock API's redirect → on callback, one fetch to validate/exchange → read the data.**

Server to start:

```bash
./run.sh        # UI + API + OIDC on http://127.0.0.1:8080
```

---

## Step 1 — Copy from Config

Open `http://127.0.0.1:8080/#config` and copy:

| Field on the Config screen | Copy value (default) |
|---|---|
| **Frontend Redirect Authorize URL** | `http://127.0.0.1:8080/common/oauth2/v2.0/authorize?...` (already contains client_id + redirect_uri + scope) |
| **Redirect URI** (form field) | `http://localhost:3000/callback` |
| **Client ID** (form field) | `00000000-0000-0000-0000-000000000001` |
| **Scope** (form field) | `openid profile email offline_access` |
| **Authority Base** (endpoints list) | `http://127.0.0.1:8080` |

If you build the URL yourself (recommended — you must add `state` + PKCE):

```
{base}/{tenant}/oauth2/v2.0/authorize
  ?client_id={CLIENT_ID}
  &redirect_uri={YOUR_CALLBACK}          <- must equal your callback route
  &response_type=code
  &scope=openid%20profile%20email%20offline_access
  &state={random}
  &nonce={random}
  &code_challenge={BASE64URL(SHA256(verifier))}
  &code_challenge_method=S256
```

* `base` + `tenant` come from the Config screen (`common`, `organizations`, `consumers`, or a tenant GUID).
* Hostname must match what you copy: `127.0.0.1` ≠ `localhost` for `redirect_uri`.

---

## Step 2 — Put it in your mock API's redirect (login route)

Your `/login` (or `/api/login`) only needs to send the browser to that URL:

```js
// GET /login  ->  302
app.get('/login', (req, res) => {
  const state = crypto.randomUUID();
  req.session.oauth = { state, verifier: req.session.verifier }; // store verifier if using PKCE
  res.redirect(
    'http://127.0.0.1:8080/common/oauth2/v2.0/authorize?' +
    new URLSearchParams({
      client_id: '00000000-0000-0000-0000-000000000001',
      redirect_uri: 'http://localhost:3000/callback',   // <-- your callback
      response_type: 'code',
      scope: 'openid profile email offline_access',
      state,
      nonce: state,
      code_challenge: challenge,          // from verifier, S256
      code_challenge_method: 'S256'
    })
  );
});
```

Both sides must use the **same `redirect_uri` string** (this server does not allowlist — you do the matching).

---

## Step 3 — On callback: the fetch that validates the data

Your callback receives:

```
GET /callback?code=0.Axxxx&state=<the one you sent>
```

1. Check `state` matches what you stored → else reject.
2. Exchange `code` for tokens with this fetch.

### If the callback runs on your **backend** (Node/Python/etc.)

```js
const res = await fetch('http://127.0.0.1:8080/common/oauth2/v2.0/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,                                                  // ?code= from callback
    redirect_uri: 'http://localhost:3000/callback',        // must equal Step 1/2
    client_id: '00000000-0000-0000-0000-000000000001',
    code_verifier: storedVerifier                          // only if you sent code_challenge
  })
});
const data = await res.json();
```

### If the callback runs in the **browser** (SPA)

```js
const data = await fetch('/api/token', {          // same-origin relay, no CORS
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token_url: `${location.origin}/common/oauth2/v2.0/token`,
    client_id: '00000000-0000-0000-0000-000000000001',
    code,
    code_verifier: storedVerifier,
    redirect_uri: `${location.origin}/callback`,
    scope: 'openid profile email offline_access'
  })
}).then(r => r.json());
```

**Request fields**

| Field | Required | Notes |
|---|---|---|
| `grant_type` | yes | `authorization_code` |
| `code` | yes | from `?code=` |
| `redirect_uri` | yes | byte-identical to the authorize request |
| `client_id` | yes | must equal the authorize `client_id` |
| `code_verifier` | if PKCE used | missing/wrong → `invalid_grant` |

---

## Step 4 — What data you get back

### Token response (`200`)

```json
{
  "token_type": "Bearer",
  "scope": "openid profile email offline_access",
  "expires_in": 3600,
  "ext_expires_in": 3600,
  "access_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ii4uLiJ9...",
  "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ii4uLiJ9...",
  "refresh_token": "rt.eyJ1c2VyX2lkIjoidXNlci0xIg..."
}
```

| Field | Use |
|---|---|
| `access_token` | JWT (`scp` = scope, `appid` = client_id) — send as `Authorization: Bearer` to APIs you mock |
| `id_token` | the identity — decode + validate (below), then store the user in your session |
| `refresh_token` | for `grant_type=refresh_token` later |
| `expires_in` | seconds (3600) |

### `id_token` claims you get

```json
{
  "iss": "https://login.microsoftonline.com/common/v2.0",
  "aud": "00000000-0000-0000-0000-000000000001",
  "exp": 1770000000, "iat": 1769996400, "nbf": 1769996400,
  "sub": "sub-alex-wilber-001",
  "oid": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
  "tid": "72f988bf-86f1-41af-91ab-2d7cd011db47",
  "name": "Alex Wilber",
  "given_name": "Alex", "family_name": "Wilber",
  "preferred_username": "alexw@contoso.onmicrosoft.com",
  "email": "alexw@contoso.onmicrosoft.com",
  "roles": ["Global Administrator", "User"],
  "groups": ["Engineers", "Admins"],
  "nonce": "<what you sent>",
  "ver": "2.0"
}
```

### Validation checklist

| Check | Expected |
|---|---|
| `state` | equals what your `/login` stored |
| `iss` | `https://login.microsoftonline.com/{tenant}/v2.0` (endpoints are local, issuer is not) |
| `aud` | equals your `client_id` |
| `exp` | not past (now < exp) |
| `nonce` | equals what you sent |
| signature | RS256 against `http://127.0.0.1:8080/{tenant}/discovery/v2.0/keys` |

One-shot server-side check (fetch + validate signature, issuer, audience):

```bash
curl -s -X POST http://127.0.0.1:8080/api/verify -H 'Content-Type: application/json' \
  -d '{"id_token":"<ID_TOKEN>","jwks_uri":"http://127.0.0.1:8080/common/discovery/v2.0/keys",
       "issuer":"https://login.microsoftonline.com/common/v2.0","audience":"00000000-0000-0000-0000-000000000001"}'
# -> {"verified":true,"claims":{...}}  |  {"verified":false,"reason":"..."}
```

Then create your session (`req.session.user = data.claims`) and redirect the user in.

---

## Refresh (later calls)

```http
POST {base}/{tenant}/oauth2/v2.0/token
grant_type=refresh_token&refresh_token=rt...&client_id={CLIENT_ID}
```

→ same JSON shape (new `access_token`, `id_token`, `refresh_token`).

---

## Errors you'll actually hit

| Response | Cause |
|---|---|
| `{"error":"invalid_grant","error_description":"...redirect_uri mismatch"}` | callback URL string differs from the authorize request |
| `...code_verifier is required for PKCE` | you sent `code_challenge` but no `code_verifier` |
| `...authorization code expired` / `not found or already used` | code older than 5 min or redeemed twice |
| `...client_id mismatch` | different `client_id` at authorize vs token |
| callback page blank | `/callback` must be served by **your** app, not proxied to sso-local |

Codes: single-use, 5-minute TTL. Nothing here should run in production — localhost only.
