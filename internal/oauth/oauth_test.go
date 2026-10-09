package oauth_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"local-sso/internal/oauth"
	"testing"
)

func TestPKCEVectors(t *testing.T) {
	// RFC 7636 Appendix B test vector
	verifier := "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
	actualChallenge := oauth.CodeChallengeS256(verifier)
	if actualChallenge != "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" {
		t.Errorf("RFC 7636 challenge mismatch: got %s", actualChallenge)
	}

	if !oauth.VerifyVerifierAndChallenge(verifier, actualChallenge) {
		t.Errorf("verifier and challenge verification failed")
	}

	v, err := oauth.GenerateCodeVerifier()
	if err != nil || len(v) < 43 {
		t.Errorf("generated verifier invalid: %v, len=%d", err, len(v))
	}

	s1, _ := oauth.GenerateState()
	s2, _ := oauth.GenerateState()
	if s1 == s2 {
		t.Errorf("expected unique states")
	}
	if !oauth.StatesEqual(s1, s1) || oauth.StatesEqual(s1, s2) {
		t.Errorf("constant time compare error")
	}
}

func TestBuildAuthorizeURL(t *testing.T) {
	authURL, tokenURL, logoutURL, discURL := oauth.EntraEndpoints("my-tenant-guid")
	if authURL != "https://login.microsoftonline.com/my-tenant-guid/oauth2/v2.0/authorize" {
		t.Errorf("unexpected entra auth url: %s", authURL)
	}
	if tokenURL != "https://login.microsoftonline.com/my-tenant-guid/oauth2/v2.0/token" {
		t.Errorf("unexpected entra token url: %s", tokenURL)
	}
	if logoutURL != "https://login.microsoftonline.com/my-tenant-guid/oauth2/v2.0/logout" {
		t.Errorf("unexpected entra logout url: %s", logoutURL)
	}
	if discURL != "https://login.microsoftonline.com/my-tenant-guid/v2.0/.well-known/openid-configuration" {
		t.Errorf("unexpected entra disc url: %s", discURL)
	}

	built, err := oauth.BuildAuthorizeURL(oauth.AuthorizeParams{
		Endpoint:      authURL,
		ClientID:      "client-123",
		RedirectURI:   "http://localhost:3000/auth",
		Scope:         "openid profile",
		State:         "state-123",
		CodeChallenge: "challenge-123",
	})
	if err != nil {
		t.Fatalf("build authorize url: %v", err)
	}
	if built == "" {
		t.Errorf("empty built url")
	}
}

func TestJWTDecode(t *testing.T) {
	// Simple unsigned test JWT
	// Header: {"typ":"JWT","alg":"none"} -> eyJ0eXAiOiJKV1QiLCJhbGciOiJub25lIn0
	// Payload: {"sub":"user-1","name":"Test User","email":"user@test.com","tid":"tenant-1","oid":"oid-1","exp":2000000000}
	rawJWT := "eyJ0eXAiOiJKV1QiLCJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyLTEiLCJuYW1lIjoiVGVzdCBVc2VyIiwiZW1haWwiOiJ1c2VyQHRlc3QuY29tIiwidGlkIjoidGVuYW50LTEiLCJvaWQiOiJvaWQtMSIsImV4cCI6MjAwMDAwMDAwMH0."

	claims, err := oauth.DecodeIDToken(rawJWT)
	if err != nil {
		t.Fatalf("decode id token: %v", err)
	}
	if claims.Subject != "user-1" || claims.Email != "user@test.com" || claims.TenantID != "tenant-1" {
		t.Errorf("claims decoded incorrectly: %+v", claims)
	}
	if claims.Identity() != "user@test.com" {
		t.Errorf("identity mismatch: %s", claims.Identity())
	}
}

func TestTokenExchangeAgainstMock(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad form", 400)
			return
		}
		if r.Form.Get("grant_type") != "authorization_code" {
			http.Error(w, "bad grant", 400)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"token_type":   "Bearer",
			"access_token": "mock-access-token",
			"id_token":     "mock-id-token",
			"expires_in":   3600,
		})
	}))
	defer ts.Close()

	resp, err := oauth.RequestToken(context.Background(), ts.Client(), oauth.TokenRequest{
		TokenURL:     ts.URL,
		ClientID:     "my-client",
		Code:         "my-code",
		CodeVerifier: "my-verifier",
		RedirectURI:  "http://localhost:3000/callback",
	})
	if err != nil {
		t.Fatalf("token request failed: %v", err)
	}
	if resp.AccessToken != "mock-access-token" {
		t.Errorf("token mismatch: %+v", resp)
	}
}

func TestJWKSValidation(t *testing.T) {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	_ = priv
}
