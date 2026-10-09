package server

import (
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"local-sso/internal/idp"
	"strings"
)

// Server holds the local IdP state, embedded assets, and configuration.
type Server struct {
	Web        embed.FS
	Port       int
	BaseURL    string // Optional explicit base URL override (e.g. "https://xxxx.ngrok-free.app")
	IssuerMode string // "host" (default) or "entra"
	KeyManager *idp.KeyManager
	UserStore  *idp.UserStore
	CodeStore  *idp.CodeStore
	Signer     *idp.Signer
}

// New creates and initializes the server with key manager, signer, and stores.
func New(port int, webFS embed.FS) (*Server, error) {
	km, err := idp.NewKeyManager()
	if err != nil {
		return nil, fmt.Errorf("init key manager: %w", err)
	}
	signer := idp.NewSigner(km)
	users := idp.NewUserStore()
	codes := idp.NewCodeStore()

	return &Server{
		Web:        webFS,
		Port:       port,
		KeyManager: km,
		UserStore:  users,
		CodeStore:  codes,
		Signer:     signer,
	}, nil
}

// corsMiddleware wraps an http.Handler to provide full CORS support for SPA consumers.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin, X-Requested-With, client_id")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Handler wires all HTTP routes.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// 1. Health and version endpoints
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","port":` + fmt.Sprintf("%d", s.Port) + `}`))
	})
	mux.HandleFunc("/api/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"name":"local-sso","version":"0.2.0"}`))
	})

	// 2. Client Playground & Relay APIs
	mux.HandleFunc("/api/token", s.HandleTokenProxy)
	mux.HandleFunc("/api/discovery", s.HandleDiscovery)
	mux.HandleFunc("/api/verify", s.HandleVerify)
	mux.HandleFunc("/callback", s.HandleCallback)

	// 3. User directory & profile APIs
	mux.HandleFunc("/api/users", s.HandleUsers)
	mux.HandleFunc("/api/users/", s.HandleUserByID)
	mux.HandleFunc("/api/user", s.HandleUserInfoEndpoint)
	mux.HandleFunc("/api/me", s.HandleUserInfoEndpoint)
	mux.HandleFunc("/api/idp/login", s.HandleIDPLogin)

	// 4. Static asset file server from embedded web FS
	sub, err := fs.Sub(s.Web, "web/dist")
	if err != nil {
		// Fallback to web if web/dist not found
		sub, _ = fs.Sub(s.Web, "web")
	}
	fileServer := http.FileServer(http.FS(sub))

	// 5. Catch-all multiplexer for dynamic tenant OIDC paths and static assets
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path

		// OIDC Discovery (.well-known/openid-configuration)
		if strings.HasSuffix(p, "/.well-known/openid-configuration") || p == "/.well-known/openid-configuration" {
			s.HandleDiscoveryEndpoint(w, r)
			return
		}

		// JWKS keys (/discovery/v2.0/keys)
		if strings.HasSuffix(p, "/discovery/v2.0/keys") || p == "/discovery/v2.0/keys" {
			s.HandleJWKSEndpoint(w, r)
			return
		}

		// Authorize endpoint (/oauth2/v2.0/authorize)
		if strings.HasSuffix(p, "/oauth2/v2.0/authorize") || p == "/oauth2/v2.0/authorize" {
			s.HandleAuthorizeEndpoint(w, r)
			return
		}

		// Token endpoint (/oauth2/v2.0/token)
		if strings.HasSuffix(p, "/oauth2/v2.0/token") || p == "/oauth2/v2.0/token" {
			s.HandleTokenEndpoint(w, r)
			return
		}

		// Logout endpoint (/oauth2/v2.0/logout)
		if strings.HasSuffix(p, "/oauth2/v2.0/logout") || p == "/oauth2/v2.0/logout" {
			s.HandleLogoutEndpoint(w, r)
			return
		}

		// Userinfo endpoint (/oidc/userinfo, /oauth2/v2.0/userinfo)
		if strings.HasSuffix(p, "/oidc/userinfo") || strings.HasSuffix(p, "/oauth2/v2.0/userinfo") || p == "/oidc/userinfo" || p == "/api/userinfo" {
			s.HandleUserInfoEndpoint(w, r)
			return
		}

		// Try static file server
		f, err := sub.Open(strings.TrimPrefix(p, "/"))
		if err == nil {
			_ = f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		// Fallback to index.html for SPA client-side routing
		indexData, err := fs.ReadFile(sub, "index.html")
		if err == nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(indexData)
			return
		}

		fileServer.ServeHTTP(w, r)
	})

	return corsMiddleware(mux)
}
