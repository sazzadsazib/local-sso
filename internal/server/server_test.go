package server_test

import (
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sso-local/internal/idp"
	"sso-local/internal/oauth"
	"sso-local/internal/server"
	"strings"
	"testing"
)

//go:embed all:testdata
var testWebFS embed.FS

func setupTestServer(t *testing.T) *server.Server {
	s, err := server.New(8080, testWebFS)
	if err != nil {
		t.Fatalf("failed to create server: %v", err)
	}
	return s
}

func TestHealthAndVersion(t *testing.T) {
	s := setupTestServer(t)
	handler := s.Handler()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/healthz", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/version", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
}

func TestCORSHeaders(t *testing.T) {
	s := setupTestServer(t)
	handler := s.Handler()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("OPTIONS", "/common/oauth2/v2.0/token", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204 for OPTIONS, got %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("missing CORS allow origin")
	}
}

func TestUserCRUDAPI(t *testing.T) {
	s := setupTestServer(t)
	handler := s.Handler()

	// List initial users
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/users", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var users []idp.MockUser
	if err := json.Unmarshal(rec.Body.Bytes(), &users); err != nil || len(users) == 0 {
		t.Fatalf("failed to decode users: %v, len=%d", err, len(users))
	}

	// Create new user
	newUserJSON := `{"name":"Alice Tester","email":"alice@example.com","roles":["Admin"]}`
	rec = httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/api/users", strings.NewReader(newUserJSON))
	req.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d", rec.Code)
	}
	var created idp.MockUser
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	if created.ID == "" || created.DisplayName != "Alice Tester" {
		t.Errorf("created user invalid: %+v", created)
	}

	// Get user by ID
	rec = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/users/"+created.ID, nil)
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 for GET user, got %d", rec.Code)
	}

	// Update user
	updateJSON := `{"name":"Alice Wonder","email":"alice@example.com","roles":["SuperAdmin"]}`
	rec = httptest.NewRecorder()
	req = httptest.NewRequest("PUT", "/api/users/"+created.ID, strings.NewReader(updateJSON))
	req.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 for PUT user, got %d", rec.Code)
	}

	// Delete user
	rec = httptest.NewRecorder()
	req = httptest.NewRequest("DELETE", "/api/users/"+created.ID, nil)
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 for DELETE user, got %d", rec.Code)
	}
}

func TestOIDCDiscoveryAndJWKS(t *testing.T) {
	s := setupTestServer(t)
	handler := s.Handler()

	// Discovery
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/mytenant/v2.0/.well-known/openid-configuration", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var disc idp.OpenIDConfiguration
	if err := json.Unmarshal(rec.Body.Bytes(), &disc); err != nil {
		t.Fatalf("unmarshal discovery: %v", err)
	}
	if !strings.Contains(disc.AuthorizationEndpoint, "/mytenant/oauth2/v2.0/authorize") {
		t.Errorf("unexpected authorize endpoint: %s", disc.AuthorizationEndpoint)
	}

	if disc.Issuer != "http://example.com/mytenant/v2.0" {
		t.Errorf("unexpected discovery issuer: %s", disc.Issuer)
	}

	// JWKS
	rec = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/mytenant/discovery/v2.0/keys", nil)
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for JWKS, got %d", rec.Code)
	}
	var jwks idp.JWKS
	if err := json.Unmarshal(rec.Body.Bytes(), &jwks); err != nil || len(jwks.Keys) == 0 {
		t.Fatalf("unmarshal JWKS failed: %v", err)
	}
}

func TestReverseProxyAndNgrokHeaders(t *testing.T) {
	s := setupTestServer(t)
	handler := s.Handler()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test-tenant/v2.0/.well-known/openid-configuration", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-Host", "tunnel-123.ngrok-free.app")
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var disc idp.OpenIDConfiguration
	if err := json.Unmarshal(rec.Body.Bytes(), &disc); err != nil {
		t.Fatalf("unmarshal discovery: %v", err)
	}

	expectedIssuer := "https://tunnel-123.ngrok-free.app/test-tenant/v2.0"
	if disc.Issuer != expectedIssuer {
		t.Errorf("expected issuer %q, got %q", expectedIssuer, disc.Issuer)
	}
	expectedAuth := "https://tunnel-123.ngrok-free.app/test-tenant/oauth2/v2.0/authorize"
	if disc.AuthorizationEndpoint != expectedAuth {
		t.Errorf("expected auth endpoint %q, got %q", expectedAuth, disc.AuthorizationEndpoint)
	}
	expectedToken := "https://tunnel-123.ngrok-free.app/test-tenant/oauth2/v2.0/token"
	if disc.TokenEndpoint != expectedToken {
		t.Errorf("expected token endpoint %q, got %q", expectedToken, disc.TokenEndpoint)
	}
}

func TestCompletePKCEFlow(t *testing.T) {
	s := setupTestServer(t)
	handler := s.Handler()

	verifier := "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])

	// 1. Authorize prompt
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/common/oauth2/v2.0/authorize?client_id=client-app-1&redirect_uri=http://localhost:3000/auth&response_type=code&scope=openid+profile+email&code_challenge="+challenge+"&code_challenge_method=S256&state=state123", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for authorize prompt, got %d", rec.Code)
	}

	// 2. Submit mock login form
	form := url.Values{}
	form.Set("client_id", "client-app-1")
	form.Set("redirect_uri", "http://localhost:3000/auth")
	form.Set("scope", "openid profile email")
	form.Set("state", "state123")
	form.Set("code_challenge", challenge)
	form.Set("code_challenge_method", "S256")
	form.Set("tenant", "common")
	form.Set("user_id", "user-1")

	rec = httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/api/idp/login", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("expected 302 redirect, got %d", rec.Code)
	}

	loc := rec.Header().Get("Location")
	redirectURL, err := url.Parse(loc)
	if err != nil {
		t.Fatalf("parse redirect url: %v", err)
	}
	code := redirectURL.Query().Get("code")
	if code == "" {
		t.Fatalf("missing code in redirect: %s", loc)
	}
	if redirectURL.Query().Get("state") != "state123" {
		t.Errorf("state mismatch: %s", redirectURL.Query().Get("state"))
	}

	// 3. Token redemption via POST /common/oauth2/v2.0/token
	tokenForm := url.Values{}
	tokenForm.Set("grant_type", "authorization_code")
	tokenForm.Set("client_id", "client-app-1")
	tokenForm.Set("code", code)
	tokenForm.Set("code_verifier", verifier)
	tokenForm.Set("redirect_uri", "http://localhost:3000/auth")

	rec = httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/common/oauth2/v2.0/token", strings.NewReader(tokenForm.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for token exchange, got %d: %s", rec.Code, rec.Body.String())
	}

	var tokenResp idp.TokenResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &tokenResp); err != nil {
		t.Fatalf("unmarshal token response: %v", err)
	}
	if tokenResp.AccessToken == "" || tokenResp.IDToken == "" || tokenResp.RefreshToken == "" {
		t.Errorf("missing tokens in response: %+v", tokenResp)
	}

	// Decode ID token and check claims
	claims, err := oauth.DecodeIDToken(tokenResp.IDToken)
	if err != nil {
		t.Fatalf("decode id_token: %v", err)
	}
	if claims.Audience != "client-app-1" || claims.Name != "Sazzad Sazib" {
		t.Errorf("unexpected claims: %+v", claims)
	}

	// 4. Test Refresh Token
	refreshForm := url.Values{}
	refreshForm.Set("grant_type", "refresh_token")
	refreshForm.Set("client_id", "client-app-1")
	refreshForm.Set("refresh_token", tokenResp.RefreshToken)

	rec = httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/common/oauth2/v2.0/token", strings.NewReader(refreshForm.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for refresh grant, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAuthorizeEndpointLoginHint(t *testing.T) {
	srv := setupTestServer(t)
	handler := srv.Handler()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/common/oauth2/v2.0/authorize?client_id=client-app-1&redirect_uri=http://localhost:3000/auth&response_type=code&scope=openid+profile&login_hint=rifat@gmail.com&prompt=select_account", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for authorize prompt, got %d", rec.Code)
	}

	body := rec.Body.String()
	// Should have default selected user set to user-2
	if !strings.Contains(body, `value="user-2"`) {
		t.Errorf("expected selectedUserId to be user-2, body did not contain value=\"user-2\"")
	}

	// Should highlight Iftekhar Rifat as selected
	rifatSelected := strings.Contains(body, `class="user-option selected" onclick="selectUser('user-2'`)
	if !rifatSelected {
		t.Errorf("expected user-2 (Iftekhar Rifat) to have class 'user-option selected'")
	}

	// user-1 (Sazib) should NOT be selected
	sazibSelected := strings.Contains(body, `class="user-option selected" onclick="selectUser('user-1'`)
	if sazibSelected {
		t.Errorf("user-1 (Sazzad Sazib) should NOT be selected when login_hint is rifat@gmail.com")
	}
}

func TestUserInfoEndpoint(t *testing.T) {
	srv := setupTestServer(t)
	handler := srv.Handler()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/common/oidc/userinfo", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for userinfo endpoint, got %d", rec.Code)
	}

	var data map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &data); err != nil {
		t.Fatalf("failed to parse userinfo json: %v", err)
	}

	if data["email"] == "" || data["sub"] == "" {
		t.Errorf("userinfo response missing email or sub: %+v", data)
	}
}

func TestAuthorizeEndpointPromptModes(t *testing.T) {
	srv := setupTestServer(t)
	handler := srv.Handler()

	t.Run("prompt=none without login_hint (instant auto-login)", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/common/oauth2/v2.0/authorize?client_id=client-app-1&redirect_uri=http://localhost:3000/auth&response_type=code&scope=openid+profile&prompt=none&state=state123", nil)
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusFound {
			t.Fatalf("expected 302 Found for prompt=none auto-login, got %d", rec.Code)
		}
		loc := rec.Header().Get("Location")
		if !strings.Contains(loc, "code=") {
			t.Errorf("expected location header to contain code, got %s", loc)
		}
		if !strings.Contains(loc, "state=state123") {
			t.Errorf("expected location header to preserve state, got %s", loc)
		}
	})

	t.Run("prompt=none with valid login_hint", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/common/oauth2/v2.0/authorize?client_id=client-app-1&redirect_uri=http://localhost:3000/auth&response_type=code&scope=openid+profile&prompt=none&login_hint=rifat@gmail.com&state=state456", nil)
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusFound {
			t.Fatalf("expected 302 Found for prompt=none with hint, got %d", rec.Code)
		}
		loc := rec.Header().Get("Location")
		if !strings.Contains(loc, "code=") {
			t.Errorf("expected location header to contain code, got %s", loc)
		}
	})

	t.Run("prompt=none with non-existent login_hint", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/common/oauth2/v2.0/authorize?client_id=client-app-1&redirect_uri=http://localhost:3000/auth&response_type=code&scope=openid+profile&prompt=none&login_hint=unknown@example.com&state=state789", nil)
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusFound {
			t.Fatalf("expected 302 Found error redirect for prompt=none with bad hint, got %d", rec.Code)
		}
		loc := rec.Header().Get("Location")
		if !strings.Contains(loc, "error=login_required") {
			t.Errorf("expected location to contain error=login_required, got %s", loc)
		}
	})

	t.Run("prompt=consent renders consent screen", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/common/oauth2/v2.0/authorize?client_id=client-app-1&redirect_uri=http://localhost:3000/auth&response_type=code&scope=openid+profile+email+offline_access&prompt=consent", nil)
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for prompt=consent, got %d", rec.Code)
		}
		body := rec.Body.String()
		if !strings.Contains(body, "prompt=consent") {
			t.Errorf("expected body to contain prompt=consent badge")
		}
		if !strings.Contains(body, "Permissions Requested") {
			t.Errorf("expected body to contain 'Permissions Requested'")
		}
		if !strings.Contains(body, "Accept &amp; Grant Permissions") && !strings.Contains(body, "Accept & Grant Permissions") {
			t.Errorf("expected body to contain 'Accept & Grant Permissions' button")
		}
		if !strings.Contains(body, "offline_access") {
			t.Errorf("expected body to list requested scopes like offline_access")
		}
	})

	t.Run("prompt=login renders fresh sign-in screen", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/common/oauth2/v2.0/authorize?client_id=client-app-1&redirect_uri=http://localhost:3000/auth&response_type=code&scope=openid+profile&prompt=login", nil)
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for prompt=login, got %d", rec.Code)
		}
		body := rec.Body.String()
		if !strings.Contains(body, "prompt=login") {
			t.Errorf("expected body to contain prompt=login badge")
		}
		if !strings.Contains(body, "Sign in to your account") {
			t.Errorf("expected body to contain 'Sign in to your account'")
		}
	})
}

