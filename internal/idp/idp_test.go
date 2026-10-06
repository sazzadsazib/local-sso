package idp_test

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"math/big"
	"sso-local/internal/idp"
	"testing"
)

func TestKeyManagerJWKS(t *testing.T) {
	km, err := idp.NewKeyManager()
	if err != nil {
		t.Fatalf("failed to create key manager: %v", err)
	}

	if km.KeyID() == "" {
		t.Errorf("expected non-empty key ID")
	}

	jwks := km.JWKS()
	if len(jwks.Keys) != 1 {
		t.Fatalf("expected 1 key in JWKS, got %d", len(jwks.Keys))
	}

	k := jwks.Keys[0]
	if k.Kty != "RSA" || k.Alg != "RS256" || k.Use != "sig" {
		t.Errorf("unexpected key attributes: %+v", k)
	}

	nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
	if err != nil {
		t.Fatalf("decode n: %v", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
	if err != nil {
		t.Fatalf("decode e: %v", err)
	}

	pubN := new(big.Int).SetBytes(nBytes)
	pubE := int(new(big.Int).SetBytes(eBytes).Int64())

	priv := km.PrivateKey()
	if pubN.Cmp(priv.PublicKey.N) != 0 {
		t.Errorf("modulus mismatch")
	}
	if pubE != priv.PublicKey.E {
		t.Errorf("exponent mismatch")
	}
}

func TestSignerAndVerification(t *testing.T) {
	km, err := idp.NewKeyManager()
	if err != nil {
		t.Fatalf("create key manager: %v", err)
	}
	signer := idp.NewSigner(km)

	user := idp.MockUser{
		ID:                "test-user",
		DisplayName:       "Test User",
		Email:             "test@example.com",
		PreferredUsername: "test@example.com",
		TenantID:          "tenant-123",
		ObjectID:          "oid-123",
		SubjectID:         "sub-123",
		Roles:             []string{"Admin"},
	}

	resp, err := signer.GenerateTokens(user, "client-app-1", "tenant-123", "nonce-123", "openid profile email", "")
	if err != nil {
		t.Fatalf("generate tokens: %v", err)
	}

	if resp.AccessToken == "" || resp.IDToken == "" || resp.RefreshToken == "" {
		t.Fatalf("missing tokens in response: %+v", resp)
	}

	parts := split3(resp.IDToken)
	if len(parts) != 3 {
		t.Fatalf("expected 3 parts for ID token, got %d", len(parts))
	}

	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		t.Fatalf("decode sig: %v", err)
	}

	signingInput := parts[0] + "." + parts[1]
	hashed := sha256.Sum256([]byte(signingInput))

	err = rsa.VerifyPKCS1v15(&km.PrivateKey().PublicKey, crypto.SHA256, hashed[:], sig)
	if err != nil {
		t.Errorf("signature verification failed: %v", err)
	}
}

func TestUserStore(t *testing.T) {
	store := idp.NewUserStore()
	users := store.List()
	if len(users) < 3 {
		t.Errorf("expected at least 3 initial seeded users, got %d", len(users))
	}

	// Test Get
	u, ok := store.Get("alexw@contoso.onmicrosoft.com")
	if !ok || u.DisplayName != "Alex Wilber" {
		t.Errorf("failed to get alexw: ok=%v, user=%+v", ok, u)
	}

	// Test Create
	newUser := store.Create(idp.MockUser{
		DisplayName: "New Test User",
		Email:       "new@example.com",
		Roles:       []string{"Tester"},
	})
	if newUser.ID == "" || newUser.ObjectID == "" {
		t.Errorf("expected auto-generated IDs, got %+v", newUser)
	}

	// Test Update
	newUser.DisplayName = "Updated User Name"
	updated, err := store.Update(newUser.ID, newUser)
	if err != nil || updated.DisplayName != "Updated User Name" {
		t.Errorf("update failed: %v", err)
	}

	// Test Delete
	err = store.Delete(newUser.ID)
	if err != nil {
		t.Errorf("delete failed: %v", err)
	}
	_, ok = store.Get(newUser.ID)
	if ok {
		t.Errorf("expected user to be deleted")
	}
}

func TestCodeStorePKCE(t *testing.T) {
	cs := idp.NewCodeStore()
	user := idp.MockUser{ID: "u1", DisplayName: "U1"}

	verifier := "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])

	code, err := cs.CreateCode("client123", "http://localhost:3000/callback", challenge, "S256", "nonce1", "openid", "common", user)
	if err != nil {
		t.Fatalf("create code: %v", err)
	}

	// Test wrong verifier
	_, err = cs.ExchangeCode(code, "client123", "wrong-verifier", "http://localhost:3000/callback")
	if err == nil {
		t.Errorf("expected exchange with wrong verifier to fail")
	}

	// Code was consumed / single-use, create another for successful test
	code2, _ := cs.CreateCode("client123", "http://localhost:3000/callback", challenge, "S256", "nonce1", "openid", "common", user)
	data, err := cs.ExchangeCode(code2, "client123", verifier, "http://localhost:3000/callback")
	if err != nil {
		t.Fatalf("exchange code failed: %v", err)
	}
	if data.ClientID != "client123" || data.User.DisplayName != "U1" {
		t.Errorf("unexpected exchanged data: %+v", data)
	}
}

func TestDiscovery(t *testing.T) {
	doc := idp.GenerateDiscovery("127.0.0.1", 8080, "organizations")
	if doc.AuthorizationEndpoint != "http://127.0.0.1:8080/organizations/oauth2/v2.0/authorize" {
		t.Errorf("unexpected auth endpoint: %s", doc.AuthorizationEndpoint)
	}
	if doc.TokenEndpoint != "http://127.0.0.1:8080/organizations/oauth2/v2.0/token" {
		t.Errorf("unexpected token endpoint: %s", doc.TokenEndpoint)
	}
	if doc.JWKSURI != "http://127.0.0.1:8080/organizations/discovery/v2.0/keys" {
		t.Errorf("unexpected jwks uri: %s", doc.JWKSURI)
	}
}

func split3(s string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '.' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}
