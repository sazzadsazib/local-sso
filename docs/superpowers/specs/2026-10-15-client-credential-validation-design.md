# Client Credential Validation (Entra-parity for the mock)

## Intent

local-sso currently accepts **any** `client_id`, any `client_secret`, and any
`redirect_uri` on its OIDC endpoints — see `internal/server/idp_handlers.go`
(`HandleAuthorizeEndpoint`, `HandleTokenEndpoint`) and `internal/idp/codes.go`
(`ExchangeCode`, which only checks a client_id *if* the caller happened to send
one). Project settings live only in browser `localStorage`, so the server has no
idea which clients exist.

The goal: make the mock behave like Microsoft Entra ID for **client credential
and configuration matching**. Even though tokens are fake, an app integrating
against local-sso should be rejected the same way Entra would reject it when the
client id, secret, redirect URI, tenant, or scope do not line up. This prevents
"it worked against the mock but fails against real Entra" surprises.

## Resolved decisions (from review)

1. **UI projects register as confidential clients.** The in-app flow
   (`/#login` callback exchange and refresh) sends `client_secret`, so a wrong
   secret genuinely fails like an Entra confidential client. PKCE is still used.
2. **Redirect URI:** sync registers `project.redirectUri`; the in-app client
   additionally always allows `${window.location.origin}/callback` so `/#login`
   keeps working. All other clients get strict exact matching.
3. **Enforcement covers every authorize entry point:** GET `/authorize`,
   the form POST `/api/idp/login`, and the `prompt=none` auto-login path.
4. **Token contract:** `client_id` is mandatory; both `client_secret_post` and
   HTTP Basic (`client_secret_basic`) are accepted; the `refresh_token` grant is
   validated too.
5. **`POST /api/clients/validate`** takes the full project (real secret) and
   returns per-check detail so the UI can distinguish "not registered" from
   "registered but wrong secret".
6. **Translation layer** between camelCase `Profile` and snake_case
   `RegisteredClient` lives in `web/src/api.ts`.

## Goals

- A server-side **client registry** the mock validates against.
- **Strict Entra-style errors** on mismatch (proper OAuth error codes/HTTP status).
- **Frontend project settings sync** to the registry, so edits in the UI take effect.
- Keep the out-of-the-box experience working (seeded default client) and keep the
  mock's own in-app test flow (`/#login`) functional.

## Non-goals

- Real secrets / real persistence. Registry is in-memory like users and codes.
- JWT signature or token lifecycle changes.
- SAML, Graph, or admin-consent flows.
- Encrypting the secret at rest (it is a mock; the value is echoed in snippets anyway).

## Anti-goals

- Silently ignoring a wrong secret (that is the bug being fixed).
- Making cold-start unusable: a fresh clone must still be able to run a full flow.
- Breaking the public-client (PKCE, secretless) path that MSAL SPAs use.

## Model

New type `RegisteredClient` (new file `internal/idp/clients.go`), managed by a
thread-safe `ClientStore` mirroring `UserStore`/`CodeStore` style:

```go
type RegisteredClient struct {
    ClientID     string   `json:"client_id"`
    ClientSecret string   `json:"client_secret,omitempty"` // empty => public client
    RedirectURIs []string `json:"redirect_uris"`
    Tenant       string   `json:"tenant"`   // "common" or a GUID; "*" in tenant whitelist
    Scopes       []string `json:"scopes"`   // allowed scopes
    Name         string   `json:"name,omitempty"`
    PublicClient bool     `json:"public_client"` // true => PKCE only, no secret required
}
```

- `Get(clientID)` returns the client and whether it exists.
- `Upsert(c)` create/update by `client_id`.
- `List()`, `Delete(clientID)`.
- `ValidateSecret(clientID, secret)`: if client is public or has an empty
  registered secret, accept; otherwise constant-time compare.

**Seeding (my call):** `NewClientStore()` seeds one client `client-app-1` with
redirect URIs `http://localhost:3000/auth` and `http://localhost:3000/callback`,
tenant `common`, and the four standard scopes. It is seeded as **confidential
with an empty registered secret**, which under `ValidateSecret` means "any
secret accepted" (Entra treats an empty/placeholder secret on a seeded sample
client as acceptable, and it keeps existing Go tests green). Real UI projects
register with a concrete secret and are matched strictly.

The frontend auto-registers each project on save and on first use, so
`client-app-1` mainly serves the Go test suite; the default UI projects
(`00000000-...-0001`, `client-app-contoso-123`) become real registered clients
through sync.

**Mock's own callback:** when registering a client originating from the UI, the
server also allows `${requestOrigin}/callback` (and `http://localhost:PORT/callback`),
so the in-app `/#login` flow validates. This is surfaced explicitly rather than
hidden.

**Public clients** (`PublicClient: true`, empty secret) require PKCE and accept
no secret; used only if a client opts in via the API. UI projects are confidential.

**Tenant matching (my call):** a registered `tenant` of `common`,
`organizations`, `consumers`, or `*` accepts any requested tenant (mirrors
multi-tenant apps). A GUID tenant must match the requested path tenant exactly
(mirrors single-tenant apps → Entra `AADSTS50194`).

## Validation rules (Entra-parity)

Applied by new middleware/helpers in `internal/server` around the existing
handlers. Errors use the OAuth error envelope (`error`, `error_description`).

| Condition | Where | Entra analogue | Mock response |
|---|---|---|---|
| `client_id` missing | authorize | invalid_request | 400 `invalid_request: client_id is required` |
| `client_id` unknown (not registered) | authorize | AADSTS700016 | 401 `unauthorized_client: Application '<id>' was not found in the directory` |
| `redirect_uri` missing | authorize | AADSTS50011 | 400 `invalid_request: redirect_uri is required` |
| `redirect_uri` not in registry (exact match) | authorize | AADSTS50011 | render error page (do **not** redirect to an untrusted URI) |
| requested `scope` not ⊆ registered scopes | authorize | AADSTS65005 | redirect-back not possible pre-auth → render error page `invalid_scope` |
| requested tenant incompatible with registered tenant | authorize | AADSTS50194 | render error page `unauthorized_client` |
| `client_id` unknown | token | AADSTS700016 | 401 `invalid_client` |
| registered secret present and does not match | token | AADSTS7000218 | 401 `invalid_client` |
| `client_secret` omitted for a confidential client | token | AADSTS7000218 | 401 `invalid_client` |
| code's tenant ≠ requested tenant | token | invalid_grant | 400 `invalid_grant: tenant mismatch` |

Notes:
- **Authorize-side redirect safety:** a redirect_uri/tenant/scope error must
  never redirect to an unvalidated URI (open-redirect risk and Entra does not
  either). Render the existing dark error card instead. If the redirect_uri
  *is* registered, errors that Entra surfaces via redirect still render a card
  for simplicity (documented deviation — mock only).
- Token endpoint always returns JSON errors; never redirects.
- Unknown scopes are rejected; the standard set (`openid`, `profile`, `email`,
  `offline_access`) is merged into every registered client's allowed scopes so
  existing projects do not break when they only registered custom scopes.

## API surface (new file `internal/server/apiclients.go`)

- `GET /api/clients` → list registered clients (secrets masked as `"***"`).
- `POST /api/clients` → upsert from a project JSON body; returns the stored client (masked).
- `DELETE /api/clients/{client_id}` → remove.
- `POST /api/clients/validate` → dry-run credential check used by the UI
  ("Test credentials"); returns `{ "ok": true|false, "checks": [...] }`.

Routes registered in `internal/server/server.go` next to the other `/api/*` routes.

## Frontend sync

- `saveActiveProject` in `web/src/views/config.ts` (Save Changes / New) also
  `POST`s the project to `/api/clients` via a new `api.ts` helper
  (`registerClient`). Failure shows a warning toast but does not block the save
  (mock stays usable offline).
- New "Client Credentials" status row / badge in Project Settings showing whether
  the active project is registered & the secret matches (`POST /api/clients/validate`).
- `web/src/types.ts` `Profile` already has `clientSecret?`; add nothing unless needed.
- The in-app test flow (`/#login`) registers its project client on load if absent.

## Files touched

- `internal/idp/clients.go` (new) — model + store + validation helpers.
- `internal/idp/clients_test.go` (new) — store + secret/tenant/scope unit tests.
- `internal/server/apiclients.go` (new) — REST handlers.
- `internal/server/server.go` — instantiate `ClientStore`, wire routes.
- `internal/server/idp_handlers.go` — validate authorize + token using the store.
- `internal/server/server_test.go` — adapt to registered clients + add rejection tests.
- `web/src/api.ts` — client API helpers.
- `web/src/views/config.ts` — sync on save, credentials status UI.
- `web/src/views/login.ts` — ensure project client registered before flow.

## What is left to the builder

- Exact copy/µformat of the error card and the validation-status badge.
- Whether to persist the registry to disk (I assume in-memory, matching users).
- Test structure and naming.

## My calls (flag if wrong)

1. Seed `client-app-1` with an **empty registered secret** (accepts any secret) so
   existing Go tests keep passing; real UI projects are matched strictly.
2. In-memory registry (no disk persistence), consistent with `UserStore`/`CodeStore`.
3. Authorize-side config errors render a card rather than redirect (open-redirect safety).
4. Standard scopes always allowed in addition to registered scopes.
5. Secret is stored/returned masked in API responses; never logged.
