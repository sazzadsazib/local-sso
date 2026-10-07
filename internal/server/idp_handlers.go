package server

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"sso-local/internal/idp"
	"sso-local/internal/oauth"
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

// requestOrigin derives the externally reachable origin (scheme://host[:port]) from the request.
// It inspects BaseURL override, reverse-proxy headers (X-Forwarded-Proto, X-Forwarded-Host),
// and falls back to r.Host and server Port.
func (s *Server) requestOrigin(r *http.Request) string {
	if s.BaseURL != "" {
		return strings.TrimRight(s.BaseURL, "/")
	}

	// 1. Determine scheme
	scheme := "http"
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		parts := strings.Split(proto, ",")
		scheme = strings.ToLower(strings.TrimSpace(parts[0]))
	} else if r.TLS != nil || r.URL.Scheme == "https" {
		scheme = "https"
	}

	// 2. Determine host
	host := r.Header.Get("X-Forwarded-Host")
	if host != "" {
		parts := strings.Split(host, ",")
		host = strings.TrimSpace(parts[0])
	} else {
		host = r.Host
	}

	if host == "" {
		host = fmt.Sprintf("localhost:%d", s.Port)
	} else if !strings.Contains(host, ":") {
		// If hostname is loopback without an explicit port, append server listen port
		h := strings.ToLower(host)
		if (h == "localhost" || h == "127.0.0.1" || h == "::1") && s.Port > 0 && s.Port != 80 && s.Port != 443 {
			host = fmt.Sprintf("%s:%d", host, s.Port)
		}
	}

	return fmt.Sprintf("%s://%s", scheme, host)
}

// resolveIssuerMode determines whether to use "host" (default) or "entra" issuer format.
func (s *Server) resolveIssuerMode(r *http.Request) string {
	if q := r.URL.Query().Get("issuer_mode"); q != "" {
		return q
	}
	if h := r.Header.Get("X-Issuer-Mode"); h != "" {
		return h
	}
	if s.IssuerMode != "" {
		return s.IssuerMode
	}
	return "host"
}

// HandleDiscoveryEndpoint serves OIDC discovery JSON for the requested tenant.
func (s *Server) HandleDiscoveryEndpoint(w http.ResponseWriter, r *http.Request) {
	tenant := extractTenant(r.URL.Path)
	origin := s.requestOrigin(r)
	issuerMode := s.resolveIssuerMode(r)
	doc := idp.GenerateDiscoveryFromOrigin(origin, tenant, issuerMode)

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
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #f5f5f5; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; min-height: 100vh; padding: 1.5rem 1rem;
      background-color: #000;
      background-image: radial-gradient(600px circle at 15% -10%, rgba(255,105,0,0.18), transparent 60%), radial-gradient(700px circle at 85% 0%, rgba(255,255,255,0.06), transparent 55%);
      position: relative; z-index: 0; }
    body::before { content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
      background-image: linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px);
      background-size: 56px 56px;
      mask-image: radial-gradient(ellipse 100% 70% at 50% 0%, #000 30%, transparent 85%);
      -webkit-mask-image: radial-gradient(ellipse 100% 70% at 50% 0%, #000 30%, transparent 85%); }
    .card { background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02)); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;
      backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%);
      box-shadow: 0 1px 0 0 rgba(255,255,255,0.06) inset, 0 30px 60px -30px rgba(0,0,0,0.95); max-width: 480px; width: 100%; padding: 2rem; margin: auto 0; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,105,0,0.12); color: #ff9733; border: 1px solid rgba(255,105,0,0.3); padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; margin-bottom: 1rem; }
    .badge-consent { background: rgba(16, 185, 129, 0.12); color: #34d399; border-color: rgba(16, 185, 129, 0.3); }
    .badge-login { background: rgba(14, 165, 233, 0.12); color: #38bdf8; border-color: rgba(14, 165, 233, 0.3); }
    .badge-select { background: rgba(168, 85, 247, 0.12); color: #c084fc; border-color: rgba(168, 85, 247, 0.3); }
    h1 { font-size: 1.4rem; font-weight: 700; letter-spacing: -0.02em; color: #fff; margin-bottom: 0.5rem; }
    p.subtitle { color: #a1a1a1; font-size: 0.875rem; line-height: 1.5; margin-bottom: 1.5rem; }
    .consent-box { background: rgba(0, 0, 0, 0.45); border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem; border: 1px solid rgba(255, 255, 255, 0.08); }
    .consent-heading { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #a1a1a1; margin-bottom: 0.75rem; }
    .scope-list { display: flex; flex-direction: column; gap: 0.6rem; }
    .scope-item { display: flex; align-items: flex-start; gap: 0.65rem; font-size: 0.8rem; }
    .scope-icon { width: 15px; height: 15px; color: #10b981; flex-shrink: 0; margin-top: 1px; }
    .scope-name { font-family: "Geist Mono", monospace; font-weight: 600; color: #38bdf8; font-size: 0.78rem; }
    .scope-desc { color: #cbd5e1; font-size: 0.75rem; line-height: 1.35; margin-top: 1px; }
    .client-info { background: rgba(0,0,0,0.45); border-radius: 10px; padding: 1rem; margin-bottom: 1.5rem; font-size: 0.8rem; border: 1px solid rgba(255,255,255,0.08); }
    .client-info div { display: flex; justify-content: space-between; margin-bottom: 0.4rem; }
    .client-info div:last-child { margin-bottom: 0; }
    .request-details { margin-bottom: 1.5rem; }
    .request-details summary { cursor: pointer; color: #a1a1a1; font-size: 0.8rem; font-weight: 600; padding: 0.3rem 0; user-select: none; }
    .client-info span.label { color: #737373; }
    .client-info span.val { color: #ebebeb; font-family: "Geist Mono", ui-monospace, monospace; word-break: break-all; text-align: right; max-width: 260px; }
    .section-label { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em; color: #737373; margin-bottom: 0.5rem; }
    .user-list { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; }
    .user-option { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 0.85rem 1rem; cursor: pointer; transition: border-color 0.15s ease, background-color 0.15s ease; }
    .user-option:hover { border-color: rgba(255,255,255,0.22); background: rgba(255,255,255,0.06); }
    .user-option.selected { border-color: #ff6900; background: rgba(255,105,0,0.12); box-shadow: 0 0 0 1px rgba(255,105,0,0.35); }
    .avatar { width: 36px; height: 36px; border-radius: 50%; background: #ff6900; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.875rem; }
    .user-meta { margin-left: 0.75rem; flex: 1; text-align: left; }
    .user-name { font-weight: 600; font-size: 0.9rem; color: #fff; }
    .user-email { color: #a1a1a1; font-size: 0.75rem; }
    .user-role { font-size: 0.7rem; background: rgba(255,255,255,0.08); color: #a1a1a1; padding: 2px 6px; border-radius: 4px; }
    .btn-submit { width: 100%; background: #fff; color: #000; border: 1px solid rgba(255,255,255,0.9); border-radius: 8px; padding: 0.85rem; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: background 0.15s, border-color 0.15s; font-family: inherit; }
    .btn-submit:hover { background: #ebebeb; border-color: #ebebeb; }
    .btn-cancel { width: 100%; background: transparent; color: #a1a1a1; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 0.7rem; font-size: 0.85rem; cursor: pointer; margin-top: 0.5rem; font-family: inherit; transition: background 0.15s, color 0.15s, border-color 0.15s; }
    .btn-cancel:hover { background: rgba(255,255,255,0.06); color: #fff; border-color: rgba(255,255,255,0.2); }
    ::selection { background: #ff6900; color: #fff; }
    .credit { margin-top: 1.25rem; padding: 0 0.5rem; width: 100%; font-size: 0.75rem; color: #737373; text-align: center; flex-shrink: 0; }
    .credit a { color: #a1a1a1; text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.15); }
    .credit a:hover { color: #ff9733; border-color: rgba(255,105,0,0.5); }
  </style>
</head>
<body>
  <div class="card">
    {{if eq .Prompt "consent"}}
      <div class="badge badge-consent">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
        Permissions Consent &middot; prompt=consent
      </div>
      <h1>Permissions Requested</h1>
      <p class="subtitle">The application <strong style="color: #fff;">{{.ClientID}}</strong> is requesting your permission to access these resources:</p>
      
      <div class="consent-box">
        <div class="consent-heading">Requested Permissions ({{len .Scopes}})</div>
        <div class="scope-list">
          {{range .Scopes}}
          <div class="scope-item">
            <svg class="scope-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            <div>
              <div class="scope-name">{{.Name}}</div>
              <div class="scope-desc">{{.Description}}</div>
            </div>
          </div>
          {{end}}
        </div>
      </div>
    {{else if eq .Prompt "login"}}
      <div class="badge badge-login">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
        Re-authentication &middot; prompt=login
      </div>
      <h1>Sign in to your account</h1>
      <p class="subtitle">The application requested fresh sign-in credentials to verify your identity.</p>
    {{else if eq .Prompt "select_account"}}
      <div class="badge badge-select">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        Account Picker &middot; prompt=select_account
      </div>
      <h1>Pick an account</h1>
      <p class="subtitle">Select a mock account to continue to <strong style="color: #fff;">{{.ClientID}}</strong>.</p>
    {{else}}
      <div class="badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14h2v2h-2v-2zm0-10h2v8h-2V6z"/></svg>
        sso-local Mock Entra IdP
      </div>
      <h1>Sign in with Microsoft</h1>
      <p class="subtitle">An application is requesting authentication via local OAuth2 / OpenID Connect.</p>
    {{end}}

    <details class="request-details">
      <summary>Request details</summary>
      <div class="client-info">
        <div><span class="label">Client ID:</span> <span class="val">{{.ClientID}}</span></div>
        <div><span class="label">Redirect URI:</span> <span class="val">{{.RedirectURI}}</span></div>
        <div><span class="label">Scope:</span> <span class="val">{{.Scope}}</span></div>
        {{if .Prompt}}<div><span class="label">Prompt:</span> <span class="val">{{.Prompt}}</span></div>{{end}}
        {{if .Tenant}}<div><span class="label">Tenant:</span> <span class="val">{{.Tenant}}</span></div>{{end}}
      </div>
    </details>

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

      <p class="section-label">{{if eq .Prompt "consent"}}GRANT ACCESS AS ACCOUNT{{else if eq .Prompt "login"}}CONFIRM ACCOUNT CREDENTIALS{{else}}SELECT IDENTITY{{end}}</p>
      <div class="user-list">
        {{range $index, $u := .Users}}
        <div class="user-option {{if eq $u.ID $.DefaultUserID}}selected{{end}}" onclick="selectUser('{{$u.ID}}', this)">
          <div class="avatar">{{slice $u.DisplayName 0 1}}</div>
          <div class="user-meta">
            <div class="user-name">{{$u.DisplayName}}</div>
            <div class="user-email">{{$u.Email}}</div>
          </div>
          {{if $u.Roles}}<span class="user-role">{{index $u.Roles 0}}</span>{{end}}
        </div>
        {{end}}
      </div>

      <button type="submit" class="btn-submit">{{if eq .Prompt "consent"}}Accept & Grant Permissions{{else if eq .Prompt "login"}}Sign in as Selected User{{else}}Continue as Selected User{{end}}</button>
      <button type="button" class="btn-cancel" onclick="cancelLogin('{{.RedirectURI}}', '{{.State}}', '{{if eq .Prompt "consent"}}consent_required{{else}}access_denied{{end}}')">{{if eq .Prompt "consent"}}Cancel & Deny Consent{{else}}Cancel{{end}}</button>
    </form>
  </div>

  <p class="credit">Developed by <a href="https://github.com/sazzadsazib" target="_blank" rel="noopener noreferrer">Sazzad Sazib &middot; @sazzadsazib</a></p>

  <script>
    function selectUser(id, el) {
      document.getElementById('selectedUserId').value = id;
      document.querySelectorAll('.user-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
    }
    function cancelLogin(redirectUri, state, err) {
      if (redirectUri) {
        var sep = redirectUri.indexOf('?') >= 0 ? '&' : '?';
        var errCode = err || 'access_denied';
        var errDesc = errCode === 'consent_required' ? 'The+user+denied+the+consent+request' : 'The+user+canceled+the+sign-in+request';
        window.location.href = redirectUri + sep + 'error=' + errCode + '&error_description=' + errDesc + '&state=' + encodeURIComponent(state || '');
      } else {
        window.location.href = '/#login';
      }
    }
  </script>
</body>
</html>
`))

// ScopeInfo holds structured scope details for consent display.
type ScopeInfo struct {
	Name        string
	Description string
}

func parseScopeInfo(scopeStr string) []ScopeInfo {
	fields := strings.Fields(scopeStr)
	var list []ScopeInfo
	for _, f := range fields {
		desc := ""
		switch f {
		case "openid":
			desc = "Sign in and authenticate your identity"
		case "profile":
			desc = "View your basic profile details (name, picture)"
		case "email":
			desc = "View your email address"
		case "offline_access":
			desc = "Maintain offline access to data (issue refresh token)"
		case "User.Read":
			desc = "Read your profile data"
		case "User.ReadWrite":
			desc = "Read and write your user profile data"
		case "Directory.Read.All":
			desc = "Read directory and organization data"
		default:
			desc = fmt.Sprintf("Access %s resource permissions", f)
		}
		list = append(list, ScopeInfo{Name: f, Description: desc})
	}
	return list
}

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
	prompt := strings.TrimSpace(q.Get("prompt"))
	loginHint := strings.TrimSpace(q.Get("login_hint"))
	tenant := extractTenant(r.URL.Path)

	users := s.UserStore.List()

	// If prompt=none:
	// OIDC Core 1.0 § 3.1.2.1: Authorization Server MUST NOT display any authentication or consent user interface pages.
	if prompt == "none" {
		if loginHint != "" {
			if u, ok := s.UserStore.Get(loginHint); ok {
				s.completeAuthorize(w, r, clientID, redirectURI, codeChallenge, codeChallengeMethod, nonce, scope, state, tenant, u)
				return
			}
			// When login_hint was requested but user is not found, return login_required
			targetRedirect := redirectURI
			if targetRedirect == "" {
				targetRedirect = fmt.Sprintf("http://localhost:%d/callback", s.Port)
			}
			sep := "?"
			if strings.Contains(targetRedirect, "?") {
				sep = "&"
			}
			http.Redirect(w, r, targetRedirect+sep+"error=login_required&error_description=User+specified+in+login_hint+not+found&state="+url.QueryEscape(state), http.StatusFound)
			return
		}

		// When no login_hint is provided with prompt=none, auto-authenticate with the default persona
		if len(users) > 0 {
			s.completeAuthorize(w, r, clientID, redirectURI, codeChallenge, codeChallengeMethod, nonce, scope, state, tenant, users[0])
			return
		}

		targetRedirect := redirectURI
		if targetRedirect == "" {
			targetRedirect = fmt.Sprintf("http://localhost:%d/callback", s.Port)
		}
		sep := "?"
		if strings.Contains(targetRedirect, "?") {
			sep = "&"
		}
		http.Redirect(w, r, targetRedirect+sep+"error=login_required&error_description=No+mock+users+available+for+silent+authentication&state="+url.QueryEscape(state), http.StatusFound)
		return
	}

	defaultUserID := ""
	if len(users) > 0 {
		defaultUserID = users[0].ID
		if loginHint != "" {
			for i, u := range users {
				if strings.EqualFold(u.Email, loginHint) ||
					strings.EqualFold(u.PreferredUsername, loginHint) ||
					u.ID == loginHint ||
					strings.EqualFold(u.DisplayName, loginHint) {
					defaultUserID = u.ID
					// Move the matched user to the front of the list for clear visual presentation
					if i > 0 {
						matched := users[i]
						users = append([]idp.MockUser{matched}, append(users[:i], users[i+1:]...)...)
					}
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
		Scopes              []ScopeInfo
		State               string
		Nonce               string
		CodeChallenge       string
		CodeChallengeMethod string
		Tenant              string
		Prompt              string
		DefaultUserID       string
		Users               []idp.MockUser
	}{
		ClientID:            clientID,
		RedirectURI:         redirectURI,
		ResponseType:        responseType,
		Scope:               scope,
		Scopes:              parseScopeInfo(scope),
		State:               state,
		Nonce:               nonce,
		CodeChallenge:       codeChallenge,
		CodeChallengeMethod: codeChallengeMethod,
		Tenant:              tenant,
		Prompt:              prompt,
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
		redirectURI = fmt.Sprintf("http://localhost:%d/callback", s.Port)
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

		issuer := fmt.Sprintf("%s/%s/v2.0", s.requestOrigin(r), tenant)
		if s.resolveIssuerMode(r) == "entra" {
			issuer = fmt.Sprintf("https://login.microsoftonline.com/%s/v2.0", tenant)
		}
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
		issuer := fmt.Sprintf("%s/%s/v2.0", s.requestOrigin(r), tenant)
		if s.resolveIssuerMode(r) == "entra" {
			issuer = fmt.Sprintf("https://login.microsoftonline.com/%s/v2.0", tenant)
		}
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
	_, _ = w.Write([]byte(`<!DOCTYPE html><html><head><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet"></head><body style="font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#000;color:#f5f5f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="border:1px solid rgba(255,255,255,0.1);background:linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02));backdrop-filter:blur(20px);border-radius:16px;padding:2rem 2.5rem;text-align:center;box-shadow:0 1px 0 0 rgba(255,255,255,0.06) inset;"><h2 style="margin:0 0 0.5rem;font-size:1.25rem;letter-spacing:-0.02em;">You have signed out of sso-local.</h2><p style="margin:0;color:#a1a1a1;font-size:0.875rem;">Close this tab or <a href="/#login" style="color:#ff6900;text-decoration:none;">return to the dashboard</a>.</p></div></body></html>`))
}

// HandleUserInfoEndpoint handles GET/POST /oidc/userinfo or /{tenant}/oidc/userinfo.
func (s *Server) HandleUserInfoEndpoint(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	authHeader := r.Header.Get("Authorization")
	accessToken := ""
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		accessToken = strings.TrimSpace(authHeader[7:])
	} else if tok := r.URL.Query().Get("access_token"); tok != "" {
		accessToken = tok
	}

	users := s.UserStore.List()
	var user idp.MockUser
	if len(users) > 0 {
		user = users[0]
	}

	if accessToken != "" {
		if claims, err := oauth.DecodeIDToken(accessToken); err == nil && claims != nil {
			if u, ok := s.UserStore.Get(claims.PreferredUsername); ok {
				user = u
			} else if u, ok := s.UserStore.Get(claims.Email); ok {
				user = u
			} else if u, ok := s.UserStore.Get(claims.Subject); ok {
				user = u
			}
		}
	}

	userInfo := map[string]interface{}{
		"sub":                user.SubjectID,
		"name":               user.DisplayName,
		"given_name":         user.GivenName,
		"family_name":        user.FamilyName,
		"preferred_username": user.PreferredUsername,
		"email":              user.Email,
		"email_verified":     true,
		"tid":                user.TenantID,
		"oid":                user.ObjectID,
	}
	if len(user.Roles) > 0 {
		userInfo["roles"] = user.Roles
	}
	if len(user.Groups) > 0 {
		userInfo["groups"] = user.Groups
	}
	for k, v := range user.CustomClaims {
		userInfo[k] = v
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(userInfo)
}
