package server

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"sso-local/internal/idp"
	"strings"
)

// ExtractTenant extracts the tenant part from a path like "/common/oauth2/v2.0/authorize" or "/72f988bf.../v2.0/.well-known/openid-configuration".
func extractTenant(path string) string {
	trimmed := strings.TrimPrefix(path, "/")
	parts := strings.Split(trimmed, "/")
	if len(parts) > 0 && parts[0] != "oauth2" && parts[0] != "v2.0" && parts[0] != "discovery" && parts[0] != ".well-known" && parts[0] != "api" && parts[0] != "static" {
		return parts[0]
	}
	return "common"
}

// HandleDiscoveryEndpoint serves OIDC discovery JSON for the requested tenant.
func (s *Server) HandleDiscoveryEndpoint(w http.ResponseWriter, r *http.Request) {
	tenant := extractTenant(r.URL.Path)
	doc := idp.GenerateDiscovery("127.0.0.1", s.Port, tenant)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(doc)
}

// HandleJWKSEndpoint serves public JWKS keys for the requested tenant.
func (s *Server) HandleJWKSEndpoint(w http.ResponseWriter, r *http.Request) {
	jwks := s.KeyManager.JWKS()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(jwks)
}

var authPromptHTML = template.Must(template.New("authPrompt").Parse(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>sso-local — Mock Sign-in Prompt</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1.5rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); max-width: 480px; width: 100%; padding: 2rem; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; margin-bottom: 1rem; }
    h1 { font-size: 1.4rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem; }
    p.subtitle { color: #94a3b8; font-size: 0.875rem; line-height: 1.5; margin-bottom: 1.5rem; }
    .client-info { background: #0f172a; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; font-size: 0.8rem; border: 1px solid #1e293b; }
    .client-info div { display: flex; justify-content: space-between; margin-bottom: 0.4rem; }
    .client-info div:last-child { margin-bottom: 0; }
    .client-info span.label { color: #64748b; }
    .client-info span.val { color: #e2e8f0; font-family: monospace; word-break: break-all; text-align: right; max-width: 260px; }
    .user-list { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; }
    .user-option { display: flex; align-items: center; justify-content: space-between; background: #273549; border: 2px solid transparent; border-radius: 10px; padding: 0.85rem 1rem; cursor: pointer; transition: all 0.15s ease; }
    .user-option:hover { border-color: #38bdf8; background: #2d3e56; }
    .user-option.selected { border-color: #38bdf8; background: rgba(56, 189, 248, 0.1); }
    .avatar { width: 36px; height: 36px; border-radius: 50%; background: #38bdf8; color: #0f172a; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.875rem; }
    .user-meta { margin-left: 0.75rem; flex: 1; text-align: left; }
    .user-name { font-weight: 600; font-size: 0.9rem; color: #f8fafc; }
    .user-email { color: #94a3b8; font-size: 0.75rem; }
    .user-role { font-size: 0.7rem; background: #334155; color: #94a3b8; padding: 2px 6px; border-radius: 4px; }
    .btn-submit { width: 100%; background: #0284c7; color: white; border: none; border-radius: 8px; padding: 0.85rem; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: background 0.15s; }
    .btn-submit:hover { background: #0369a1; }
    .btn-cancel { width: 100%; background: transparent; color: #94a3b8; border: 1px solid #334155; border-radius: 8px; padding: 0.7rem; font-size: 0.85rem; cursor: pointer; margin-top: 0.5rem; }
    .btn-cancel:hover { background: #334155; color: #f8fafc; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14h2v2h-2v-2zm0-10h2v8h-2V6z"/></svg>
      sso-local Mock Entra IdP
    </div>
    <h1>Sign in with Microsoft</h1>
    <p class="subtitle">An application is requesting authentication via local OAuth2 / OpenID Connect.</p>

    <div class="client-info">
      <div><span class="label">Client ID:</span> <span class="val">{{.ClientID}}</span></div>
      <div><span class="label">Redirect URI:</span> <span class="val">{{.RedirectURI}}</span></div>
      <div><span class="label">Scope:</span> <span class="val">{{.Scope}}</span></div>
      {{if .Tenant}}<div><span class="label">Tenant:</span> <span class="val">{{.Tenant}}</span></div>{{end}}
    </div>

    <form method="POST" action="/api/idp/login" id="loginForm">
      <input type="hidden" name="client_id" value="{{.ClientID}}">
      <input type="hidden" name="redirect_uri" value="{{.RedirectURI}}">
      <input type="hidden" name="response_type" value="{{.ResponseType}}">
      <input type="hidden" name="scope" value="{{.Scope}}">
      <input type="hidden" name="state" value="{{.State}}">
      <input type="hidden" name="nonce" value="{{.Nonce}}">
      <input type="hidden" name="code_challenge" value="{{.CodeChallenge}}">
      <input type="hidden" name="code_challenge_method" value="{{.CodeChallengeMethod}}">
      <input type="hidden" name="tenant" value="{{.Tenant}}">
      <input type="hidden" name="user_id" id="selectedUserId" value="{{.DefaultUserID}}">

      <p style="font-size: 0.8rem; font-weight: 600; color: #94a3b8; margin-bottom: 0.5rem;">SELECT IDENTITY:</p>
      <div class="user-list">
        {{range $index, $u := .Users}}
        <div class="user-option {{if eq $index 0}}selected{{end}}" onclick="selectUser('{{$u.ID}}', this)">
          <div class="avatar">{{slice $u.DisplayName 0 1}}</div>
          <div class="user-meta">
            <div class="user-name">{{$u.DisplayName}}</div>
            <div class="user-email">{{$u.Email}}</div>
          </div>
          {{if $u.Roles}}<span class="user-role">{{index $u.Roles 0}}</span>{{end}}
        </div>
        {{end}}
      </div>

      <button type="submit" class="btn-submit">Continue as Selected User</button>
      <button type="button" class="btn-cancel" onclick="cancelLogin('{{.RedirectURI}}', '{{.State}}')">Cancel</button>
    </form>
  </div>

  <script>
    function selectUser(id, el) {
      document.getElementById('selectedUserId').value = id;
      document.querySelectorAll('.user-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
    }
    function cancelLogin(redirectUri, state) {
      if (redirectUri) {
        var sep = redirectUri.indexOf('?') >= 0 ? '&' : '?';
        window.location.href = redirectUri + sep + 'error=access_denied&error_description=The+user+canceled+the+sign-in+request&state=' + encodeURIComponent(state || '');
      } else {
        window.location.href = '/#login';
      }
    }
  </script>
</body>
</html>
`))

// HandleAuthorizeEndpoint handles GET /{tenant}/oauth2/v2.0/authorize.
func (s *Server) HandleAuthorizeEndpoint(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	clientID := q.Get("client_id")
	redirectURI := q.Get("redirect_uri")
	responseType := q.Get("response_type")
	scope := q.Get("scope")
	state := q.Get("state")
	nonce := q.Get("nonce")
	codeChallenge := q.Get("code_challenge")
	codeChallengeMethod := q.Get("code_challenge_method")
	prompt := q.Get("prompt")
	loginHint := q.Get("login_hint")
	tenant := extractTenant(r.URL.Path)

	users := s.UserStore.List()

	// If prompt=none and login_hint is supplied, or auto-login mode
	if prompt == "none" && loginHint != "" {
		if u, ok := s.UserStore.Get(loginHint); ok {
			s.completeAuthorize(w, r, clientID, redirectURI, codeChallenge, codeChallengeMethod, nonce, scope, state, tenant, u)
			return
		}
	}

	defaultUserID := ""
	if len(users) > 0 {
		defaultUserID = users[0].ID
		if loginHint != "" {
			for _, u := range users {
				if u.Email == loginHint || u.PreferredUsername == loginHint {
					defaultUserID = u.ID
					break
				}
			}
		}
	}

	data := struct {
		ClientID            string
		RedirectURI         string
		ResponseType        string
		Scope               string
		State               string
		Nonce               string
		CodeChallenge       string
		CodeChallengeMethod string
		Tenant              string
		DefaultUserID       string
		Users               []idp.MockUser
	}{
		ClientID:            clientID,
		RedirectURI:         redirectURI,
		ResponseType:        responseType,
		Scope:               scope,
		State:               state,
		Nonce:               nonce,
		CodeChallenge:       codeChallenge,
		CodeChallengeMethod: codeChallengeMethod,
		Tenant:              tenant,
		DefaultUserID:       defaultUserID,
		Users:               users,
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = authPromptHTML.Execute(w, data)
}

// HandleIDPLogin processes the form submission from the interactive mock sign-in prompt.
func (s *Server) HandleIDPLogin(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	clientID := r.FormValue("client_id")
	redirectURI := r.FormValue("redirect_uri")
	scope := r.FormValue("scope")
	state := r.FormValue("state")
	nonce := r.FormValue("nonce")
	codeChallenge := r.FormValue("code_challenge")
	codeChallengeMethod := r.FormValue("code_challenge_method")
	tenant := r.FormValue("tenant")
	userID := r.FormValue("user_id")

	user, ok := s.UserStore.Get(userID)
	if !ok {
		users := s.UserStore.List()
		if len(users) > 0 {
			user = users[0]
		}
	}

	s.completeAuthorize(w, r, clientID, redirectURI, codeChallenge, codeChallengeMethod, nonce, scope, state, tenant, user)
}

func (s *Server) completeAuthorize(w http.ResponseWriter, r *http.Request, clientID, redirectURI, codeChallenge, codeChallengeMethod, nonce, scope, state, tenant string, user idp.MockUser) {
	if redirectURI == "" {
		redirectURI = fmt.Sprintf("http://127.0.0.1:%d/callback", s.Port)
	}

	code, err := s.CodeStore.CreateCode(clientID, redirectURI, codeChallenge, codeChallengeMethod, nonce, scope, tenant, user)
	if err != nil {
		http.Error(w, "Failed to generate authorization code", http.StatusInternalServerError)
		return
	}

	u, err := url.Parse(redirectURI)
	if err != nil {
		http.Error(w, "Invalid redirect_uri", http.StatusBadRequest)
		return
	}

	q := u.Query()
	q.Set("code", code)
	if state != "" {
		q.Set("state", state)
	}
	u.RawQuery = q.Encode()

	http.Redirect(w, r, u.String(), http.StatusFound)
}

// HandleTokenEndpoint handles POST /{tenant}/oauth2/v2.0/token.
func (s *Server) HandleTokenEndpoint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseForm(); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid_request","error_description":"failed to parse request form"}`))
		return
	}

	grantType := r.FormValue("grant_type")
	clientID := r.FormValue("client_id")
	if clientID == "" {
		clientID = r.URL.Query().Get("client_id")
	}
	tenant := extractTenant(r.URL.Path)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	switch grantType {
	case "authorization_code":
		code := r.FormValue("code")
		codeVerifier := r.FormValue("code_verifier")
		redirectURI := r.FormValue("redirect_uri")

		codeData, err := s.CodeStore.ExchangeCode(code, clientID, codeVerifier, redirectURI)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error":             "invalid_grant",
				"error_description": err.Error(),
			})
			return
		}

		issuer := fmt.Sprintf("https://login.microsoftonline.com/%s/v2.0", tenant)
		tokenResp, err := s.Signer.GenerateTokens(codeData.User, codeData.ClientID, tenant, codeData.Nonce, codeData.Scope, issuer)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error":             "server_error",
				"error_description": err.Error(),
			})
			return
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(tokenResp)

	case "refresh_token":
		refreshToken := r.FormValue("refresh_token")
		if refreshToken == "" {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error":             "invalid_request",
				"error_description": "missing refresh_token",
			})
			return
		}

		// Retrieve user (first mock user if not encoded)
		users := s.UserStore.List()
		var user idp.MockUser
		if len(users) > 0 {
			user = users[0]
		}

		scope := r.FormValue("scope")
		if scope == "" {
			scope = "openid profile email offline_access"
		}
		issuer := fmt.Sprintf("https://login.microsoftonline.com/%s/v2.0", tenant)
		tokenResp, err := s.Signer.GenerateTokens(user, clientID, tenant, "", scope, issuer)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error":             "server_error",
				"error_description": err.Error(),
			})
			return
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(tokenResp)

	default:
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":             "unsupported_grant_type",
			"error_description": fmt.Sprintf("grant_type '%s' is not supported", grantType),
		})
	}
}

// HandleLogoutEndpoint handles GET /{tenant}/oauth2/v2.0/logout.
func (s *Server) HandleLogoutEndpoint(w http.ResponseWriter, r *http.Request) {
	postLogout := r.URL.Query().Get("post_logout_redirect_uri")
	if postLogout != "" {
		http.Redirect(w, r, postLogout, http.StatusFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(`<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;"><h2>You have signed out of sso-local.</h2></body></html>`))
}
