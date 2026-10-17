package server

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"local-sso/internal/idp"
	"local-sso/internal/oauth"
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
  <title>local-sso — Mock Sign-in Prompt</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script>
    (function() {
      try {
        var theme = localStorage.getItem('local-sso-theme');
        if (theme === 'light') {
          document.documentElement.classList.add('light');
        }
      } catch (e) {}
    })();
  </script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @keyframes rainbow-glow {
      0% { filter: blur(85px) hue-rotate(0deg); }
      50% { filter: blur(105px) hue-rotate(180deg); }
      100% { filter: blur(85px) hue-rotate(360deg); }
    }
    @keyframes rainbow-float {
      0% { transform: translate3d(0, 0, 0) scale(1); }
      50% { transform: translate3d(2vw, -1.8vh, 0) scale(1.05); }
      100% { transform: translate3d(0, 0, 0) scale(1); }
    }
    @keyframes rainbow-shade-sync {
      0% { filter: hue-rotate(0deg); }
      50% { filter: hue-rotate(180deg); }
      100% { filter: hue-rotate(360deg); }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
    body { font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #f8f9fa; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; min-height: 100vh; padding: 2rem 1rem;
      background-color: #07070a;
      position: relative; z-index: 0; transition: background-color 0.2s ease, color 0.2s ease; overflow-x: hidden; }
    body::before { content: ""; position: fixed; inset: -15vw; z-index: -1; pointer-events: none;
      background:
        radial-gradient(56vw 56vw at 12% 8%, rgba(255, 60, 95, 0.3), transparent 60%),
        radial-gradient(50vw 50vw at 88% 6%, rgba(245, 158, 11, 0.26), transparent 58%),
        radial-gradient(54vw 54vw at 80% 92%, rgba(16, 185, 129, 0.24), transparent 60%),
        radial-gradient(48vw 48vw at 14% 92%, rgba(139, 92, 246, 0.28), transparent 60%),
        radial-gradient(46vw 42vw at 50% 50%, rgba(236, 72, 153, 0.22), transparent 65%),
        #07070a;
      animation: rainbow-glow 32s linear infinite, rainbow-float 24s ease-in-out infinite alternate;
      will-change: filter, transform; }
    .card { background: linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.035)); border: 1px solid rgba(255,255,255,0.15); border-radius: 24px;
      backdrop-filter: blur(24px) saturate(170%); -webkit-backdrop-filter: blur(24px) saturate(170%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 24px 60px rgba(0,0,0,0.7); max-width: 480px; width: 100%; padding: 2rem; margin: auto 0; transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease; }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,70,92,0.12); color: #ff5c6c; border: 1px solid rgba(255,92,112,0.3); padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-consent { background: rgba(52, 211, 153, 0.12); color: #34d399; border-color: rgba(52, 211, 153, 0.3); }
    .badge-login { background: rgba(255, 70, 92, 0.12); color: #ff5c6c; border-color: rgba(255, 92, 112, 0.3); animation: rainbow-shade-sync 32s linear infinite; }
    .badge-select { background: rgba(148, 163, 184, 0.15); color: #e2e8f0; border-color: rgba(148, 163, 184, 0.3); }
    .theme-toggle { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); color: #a1a1aa; width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s ease; padding: 0; }
    .theme-toggle:hover { background: rgba(255, 255, 255, 0.1); color: #fff; border-color: rgba(255, 255, 255, 0.25); }
    .theme-toggle .icon-moon { display: none; }
    .theme-toggle .icon-sun { display: block; }
    h1 { font-size: 1.4rem; font-weight: 700; letter-spacing: -0.025em; color: #fff; margin-bottom: 0.5rem; }
    p.subtitle { color: #a1a1aa; font-size: 0.875rem; line-height: 1.5; margin-bottom: 1.5rem; }
    .consent-box { background: rgba(0, 0, 0, 0.5); border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem; border: 1px solid rgba(255, 255, 255, 0.08); }
    .consent-heading { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #a1a1aa; margin-bottom: 0.75rem; }
    .scope-list { display: flex; flex-direction: column; gap: 0.6rem; }
    .scope-item { display: flex; align-items: flex-start; gap: 0.65rem; font-size: 0.8rem; }
    .scope-icon { width: 15px; height: 15px; color: #34d399; flex-shrink: 0; margin-top: 1px; }
    .scope-name { font-family: "Geist Mono", monospace; font-weight: 600; color: #ff5c6c; font-size: 0.78rem; }
    .scope-desc { color: #cbd5e1; font-size: 0.75rem; line-height: 1.35; margin-top: 1px; }
    .client-info { background: rgba(0,0,0,0.5); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; font-size: 0.8rem; border: 1px solid rgba(255,255,255,0.08); }
    .client-info div { display: flex; justify-content: space-between; margin-bottom: 0.4rem; }
    .client-info div:last-child { margin-bottom: 0; }
    .request-details { margin-bottom: 1.5rem; }
    .request-details summary { cursor: pointer; color: #a1a1aa; font-size: 0.8rem; font-weight: 600; padding: 0.3rem 0; user-select: none; }
    .client-info span.label { color: #71717a; }
    .client-info span.val { color: #e4e4e7; font-family: "Geist Mono", ui-monospace, monospace; word-break: break-all; text-align: right; max-width: 260px; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
    .section-label { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em; color: #71717a; }
    .section-hint { font-size: 0.72rem; color: #ff5c6c; font-weight: 500; display: inline-flex; align-items: center; gap: 4px; }
    .user-list { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1.5rem; }
    .user-option { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 0.8rem 1rem; cursor: pointer; transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease; user-select: none; -webkit-user-select: none; }
    .user-option:hover { border-color: rgba(255,255,255,0.22); background: rgba(255,255,255,0.08); transform: translateY(-1px); }
    .user-option.selected { border-color: #ff5c6c; background: rgba(255,70,92,0.12); box-shadow: 0 0 0 1px rgba(255,92,112,0.3); animation: rainbow-shade-sync 32s linear infinite; will-change: filter; }
    .avatar { width: 36px; height: 36px; border-radius: 10px; background: rgba(255,70,92,0.15); color: #ff5c6c; border: 1px solid rgba(255,92,112,0.3); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.875rem; flex-shrink: 0; overflow: hidden; position: relative; }
    .avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 10px; display: block; }
    .user-meta { margin-left: 0.75rem; flex: 1; text-align: left; }
    .user-name { font-weight: 600; font-size: 0.9rem; color: #fff; }
    .user-email { color: #a1a1aa; font-size: 0.75rem; }
    .user-right { display: flex; align-items: center; gap: 8px; }
    .user-role { font-size: 0.7rem; background: rgba(255,255,255,0.08); color: #a1a1aa; padding: 2px 7px; border-radius: 9999px; }
    .user-check { display: none; color: #ff5c6c; line-height: 0; }
    .user-option.selected .user-check { display: inline-flex; }
    .btn-submit { width: 100%; background: linear-gradient(180deg, #e0243c, #9e0d20); color: #ffffff !important; border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 9999px; padding: 0.85rem; font-size: 0.92rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease; font-family: inherit; box-shadow: 0 10px 28px rgba(200, 18, 44, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.32); animation: rainbow-shade-sync 32s linear infinite; will-change: filter; }
    .btn-submit:hover { border-color: rgba(255, 255, 255, 0.38); background: linear-gradient(180deg, #dd2339, #7f0817); box-shadow: 0 14px 34px rgba(220, 24, 50, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.42); transform: translateY(-1px); }
    .btn-cancel { width: 100%; background: transparent; color: #a1a1aa; border: 1px solid rgba(255,255,255,0.12); border-radius: 9999px; padding: 0.75rem; font-size: 0.85rem; cursor: pointer; margin-top: 0.5rem; font-family: inherit; transition: background 0.15s, color 0.15s, border-color 0.15s; }
    .btn-cancel:hover { background: rgba(255,255,255,0.06); color: #fff; border-color: rgba(255,255,255,0.24); }
    .loading-overlay { position: fixed; inset: 0; z-index: 1000; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 1.5rem; background: rgba(4,4,8,0.72); backdrop-filter: blur(16px) saturate(160%); -webkit-backdrop-filter: blur(16px) saturate(160%); animation: modalFadeIn 0.2s ease-out both; }
    .loading-overlay.active { display: flex; }
    .loading-card { background: linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.04)); border: 1px solid rgba(255,255,255,0.18); border-radius: 20px; padding: 2rem 2.5rem; max-width: 380px; width: 100%; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.9rem; box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 24px 60px rgba(0,0,0,0.6); }
    .spinner { width: 44px; height: 44px; border-radius: 50%; border: 3.5px solid rgba(255,255,255,0.15); border-top-color: #ff5c6c; animation: spin 0.75s linear infinite, rainbow-shade-sync 32s linear infinite; will-change: transform, filter; }
    .loading-text { color: #f8f9fa; font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; }
    .loading-sub { color: #a1a1aa; font-size: 0.82rem; }
    ::selection { background: #ff5c6c; color: #ffffff; }
    .credit { margin-top: 1.25rem; padding: 0 0.5rem; width: 100%; font-size: 0.75rem; color: #71717a; text-align: center; flex-shrink: 0; }
    .credit a { color: #a1a1aa; text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.15); }
    .credit a:hover { color: #ff5c6c; border-color: rgba(255,92,112,0.5); }

    /* Light Theme overrides */
    html.light body {
      background-color: #f8fafc;
      color: #09090b;
      background-image: radial-gradient(64vw 64vw at 8% 2%, rgba(56,189,248,0.08), transparent 60%), radial-gradient(54vw 54vw at 92% -2%, rgba(148,163,184,0.12), transparent 58%), #f8fafc;
    }
    html.light body::before {
      background-image: linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px);
    }
    html.light body {
      background-color: #f5f6fa;
      color: #0e0e15;
    }
    html.light body::before {
      opacity: 0.55;
      background:
        radial-gradient(56vw 56vw at 12% 8%, rgba(255, 60, 95, 0.16), transparent 60%),
        radial-gradient(50vw 50vw at 88% 6%, rgba(245, 158, 11, 0.14), transparent 58%),
        radial-gradient(54vw 54vw at 80% 92%, rgba(16, 185, 129, 0.12), transparent 60%),
        radial-gradient(48vw 48vw at 14% 92%, rgba(139, 92, 246, 0.14), transparent 60%),
        radial-gradient(46vw 42vw at 50% 50%, rgba(236, 72, 153, 0.12), transparent 65%),
        #f5f6fa;
    }
    html.light .card {
      background: linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,255,255,0.65));
      border: 1px solid rgba(255,255,255,0.92);
      box-shadow: inset 0 1px 0 #ffffff, 0 20px 50px rgba(20,20,40,0.1);
    }
    html.light .theme-toggle {
      background: #f1f5f9;
      border-color: #e2e8f0;
      color: #64748b;
    }
    html.light .theme-toggle:hover {
      background: #e2e8f0;
      color: #09090b;
      border-color: #cbd5e1;
    }
    html.light .theme-toggle .icon-sun { display: none; }
    html.light .theme-toggle .icon-moon { display: block; }
    html.light .badge {
      background: rgba(200, 18, 44, 0.09);
      color: #c8122c;
      border-color: rgba(200, 18, 44, 0.25);
    }
    html.light .badge-consent {
      background: rgba(5, 150, 105, 0.1);
      color: #059669;
      border-color: rgba(5, 150, 105, 0.25);
    }
    html.light .badge-login {
      background: rgba(200, 18, 44, 0.09);
      color: #c8122c;
      border-color: rgba(200, 18, 44, 0.25);
    }
    html.light .badge-select {
      background: rgba(148, 163, 184, 0.15);
      color: #334155;
      border-color: rgba(148, 163, 184, 0.25);
    }
    html.light h1 { color: #09090b; }
    html.light p.subtitle { color: #64748b; }
    html.light p.subtitle strong { color: #09090b !important; }
    html.light .consent-box { background: #f8fafc; border-color: #e2e8f0; }
    html.light .consent-heading { color: #64748b; }
    html.light .scope-name { color: #c8122c; }
    html.light .scope-desc { color: #475569; }
    html.light .client-info { background: #f8fafc; border-color: #e2e8f0; }
    html.light .request-details summary { color: #64748b; }
    html.light .request-details summary:hover { color: #09090b; }
    html.light .client-info span.label { color: #64748b; }
    html.light .client-info span.val { color: #09090b; }
    html.light .section-label { color: #64748b; }
    html.light .section-hint { color: #c8122c; }
    html.light .user-option { background: #ffffff; border: 1px solid #e2e8f0; }
    html.light .user-option:hover { border-color: #cbd5e1; background: #f8fafc; }
    html.light .user-option.selected { border-color: #c8122c; background: rgba(200, 18, 44, 0.08); box-shadow: 0 0 0 1px rgba(200, 18, 44, 0.25); }
    html.light .user-name { color: #09090b; }
    html.light .user-email { color: #64748b; }
    html.light .user-role { background: #e2e8f0; color: #475569; }
    html.light .btn-submit {
      background: linear-gradient(180deg, #c8122c, #9d0a20);
      color: #ffffff !important;
      border: 1px solid rgba(255, 255, 255, 0.32);
      box-shadow: 0 10px 26px rgba(200, 18, 44, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.42);
      animation: rainbow-shade-sync 32s linear infinite;
      will-change: filter;
    }
    html.light .btn-submit:hover {
      background: linear-gradient(180deg, #b01026, #7a0818);
      box-shadow: 0 12px 30px rgba(176, 16, 38, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.5);
    }
    html.light .btn-cancel { background: transparent; color: #64748b; border-color: #e2e8f0; }
    html.light .btn-cancel:hover { background: #f1f5f9; color: #09090b; border-color: #cbd5e1; }
    html.light .loading-overlay { background: rgba(15, 23, 42, 0.38); }
    html.light .loading-card { background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,255,255,0.88)); border: 1px solid rgba(255,255,255,0.95); box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12); }
    html.light .loading-text { color: #09090b; }
    html.light .loading-sub { color: #64748b; }
    html.light .spinner { border-color: rgba(0,0,0,0.1); border-top-color: #c8122c; }
    html.light .credit { color: #94a3b8; }
    html.light .credit a { color: #64748b; border-bottom: 1px solid #cbd5e1; }
    html.light .credit a:hover { color: #c8122c; }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header">
      {{if eq .Prompt "consent"}}
        <div class="badge badge-consent">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
          Permissions Consent &middot; prompt=consent
        </div>
      {{else if eq .Prompt "login"}}
        <div class="badge badge-login">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
          Re-authentication &middot; prompt=login
        </div>
      {{else if eq .Prompt "select_account"}}
        <div class="badge badge-select">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          Account Picker &middot; prompt=select_account
        </div>
      {{else}}
        <div class="badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14h2v2h-2v-2zm0-10h2v8h-2V6z"/></svg>
          local-sso Mock Entra IdP
        </div>
      {{end}}

      <button type="button" class="theme-toggle" id="themeToggleBtn" aria-label="Toggle light or dark theme" title="Toggle theme">
        <svg class="icon-sun" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
        <svg class="icon-moon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      </button>
    </div>

    {{if eq .Prompt "consent"}}
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
      <h1>Sign in to your account</h1>
      <p class="subtitle">The application requested fresh sign-in credentials to verify your identity.</p>
    {{else if eq .Prompt "select_account"}}
      <h1>Pick an account</h1>
      <p class="subtitle">Select a mock account to continue to <strong style="color: #fff;">{{.ClientID}}</strong>.</p>
    {{else}}
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

      <div class="section-header">
        <p class="section-label">{{if eq .Prompt "consent"}}GRANT ACCESS AS ACCOUNT{{else if eq .Prompt "login"}}CONFIRM ACCOUNT CREDENTIALS{{else}}SELECT IDENTITY{{end}}</p>
        <span class="section-hint" title="Double-click any user card to sign in instantly">Double-click to sign in</span>
      </div>

      <div class="user-list">
        {{range $index, $u := .Users}}
        <div class="user-option {{if eq $u.ID $.DefaultUserID}}selected{{end}}" onclick="selectUser('{{$u.ID}}', this)" ondblclick="quickSubmitUser('{{$u.ID}}', this)" onkeydown="handleUserKey(event, '{{$u.ID}}', this)" tabindex="0" role="button" title="Click to select, double-click to sign in">
          <div class="avatar">{{if $u.AvatarURL}}<img src="{{$u.AvatarURL}}" alt="{{$u.DisplayName}}" class="avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';"><span style="display:none;">{{slice $u.DisplayName 0 1}}</span>{{else}}<span>{{slice $u.DisplayName 0 1}}</span>{{end}}</div>
          <div class="user-meta">
            <div class="user-name">{{$u.DisplayName}}</div>
            <div class="user-email">{{$u.Email}}</div>
          </div>
          <div class="user-right">
            {{if $u.Roles}}<span class="user-role">{{index $u.Roles 0}}</span>{{end}}
            <span class="user-check">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
            </span>
          </div>
        </div>
        {{end}}
      </div>

      <button type="submit" class="btn-submit">{{if eq .Prompt "consent"}}Accept & Grant Permissions{{else if eq .Prompt "login"}}Sign in as Selected User{{else}}Continue as Selected User{{end}}</button>
      <button type="button" class="btn-cancel" onclick="cancelLogin('{{.RedirectURI}}', '{{.State}}', '{{if eq .Prompt "consent"}}consent_required{{else}}access_denied{{end}}')">{{if eq .Prompt "consent"}}Cancel & Deny Consent{{else}}Cancel{{end}}</button>
    </form>
  </div>

  <div class="loading-overlay" id="loadingOverlay">
    <div class="loading-card">
      <div class="spinner"></div>
      <div class="loading-text">Signing you in&hellip;</div>
      <div class="loading-sub">Redirecting to the application</div>
    </div>
  </div>

  <p class="credit">Developed by <a href="https://github.com/sazzadsazib" target="_blank" rel="noopener noreferrer">Sazzad Sazib &middot; @sazzadsazib</a></p>

  <script>
    var submitting = false;
    function showLoading() {
      if (submitting) return;
      submitting = true;
      document.body.style.pointerEvents = 'none';
      var overlay = document.getElementById('loadingOverlay');
      if (overlay) overlay.classList.add('active');
    }
    function selectUser(id, el) {
      if (submitting) return;
      document.getElementById('selectedUserId').value = id;
      document.querySelectorAll('.user-option').forEach(function(o) { o.classList.remove('selected'); });
      el.classList.add('selected');
    }
    function quickSubmitUser(id, el) {
      if (submitting) return;
      selectUser(id, el);
      var form = document.getElementById('loginForm');
      if (form) {
        showLoading();
        form.submit();
      }
    }
    function handleUserKey(e, id, el) {
      if (e.key === 'Enter') {
        e.preventDefault();
        quickSubmitUser(id, el);
      } else if (e.key === ' ') {
        e.preventDefault();
        selectUser(id, el);
      }
    }
    function toggleTheme() {
      var html = document.documentElement;
      var isLight = html.classList.toggle('light');
      try {
        localStorage.setItem('local-sso-theme', isLight ? 'light' : 'dark');
      } catch (e) {}
    }
    var themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', toggleTheme);
    }
    document.getElementById('loginForm').addEventListener('submit', function (e) {
      if (submitting) { e.preventDefault(); return; }
      showLoading();
    });
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

		issuer := fmt.Sprintf("%s/%s/oauth2/v2.0", s.requestOrigin(r), tenant)
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
		issuer := fmt.Sprintf("%s/%s/oauth2/v2.0", s.requestOrigin(r), tenant)
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
	_, _ = w.Write([]byte(`<!DOCTYPE html><html><head><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet"></head><body style="font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#000;color:#f5f5f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="border:1px solid rgba(255,255,255,0.1);background:linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02));backdrop-filter:blur(20px);border-radius:16px;padding:2rem 2.5rem;text-align:center;box-shadow:0 1px 0 0 rgba(255,255,255,0.06) inset;"><h2 style="margin:0 0 0.5rem;font-size:1.25rem;letter-spacing:-0.02em;">You have signed out of local-sso.</h2><p style="margin:0;color:#a1a1a1;font-size:0.875rem;">Close this tab or <a href="/#login" style="color:#ff6900;text-decoration:none;">return to the dashboard</a>.</p></div></body></html>`))
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
	if user.AvatarURL != "" {
		userInfo["picture"] = user.AvatarURL
	}
	for k, v := range user.CustomClaims {
		userInfo[k] = v
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(userInfo)
}
