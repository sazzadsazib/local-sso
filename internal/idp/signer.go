package idp

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

// Signer signs JWT tokens using the local KeyManager.
type Signer struct {
	km *KeyManager
}

// NewSigner creates a new token signer.
func NewSigner(km *KeyManager) *Signer {
	return &Signer{km: km}
}

// TokenResponse represents standard OAuth2/OIDC token response.
type TokenResponse struct {
	TokenType    string `json:"token_type"`
	Scope        string `json:"scope"`
	ExpiresIn    int64  `json:"expires_in"`
	ExtExpiresIn int64  `json:"ext_expires_in,omitempty"`
	AccessToken  string `json:"access_token"`
	IDToken      string `json:"id_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

// SignToken generates and signs an RS256 JWT with custom claims.
func (s *Signer) SignToken(claims map[string]interface{}) (string, error) {
	header := map[string]string{
		"typ": "JWT",
		"alg": "RS256",
		"kid": s.km.KeyID(),
	}

	hdrBytes, err := json.Marshal(header)
	if err != nil {
		return "", fmt.Errorf("marshal header: %w", err)
	}
	claimsBytes, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("marshal claims: %w", err)
	}

	hdrB64 := base64.RawURLEncoding.EncodeToString(hdrBytes)
	claimsB64 := base64.RawURLEncoding.EncodeToString(claimsBytes)
	signingInput := hdrB64 + "." + claimsB64

	hashed := sha256.Sum256([]byte(signingInput))
	sig, err := rsa.SignPKCS1v15(rand.Reader, s.km.PrivateKey(), crypto.SHA256, hashed[:])
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}

	sigB64 := base64.RawURLEncoding.EncodeToString(sig)
	return signingInput + "." + sigB64, nil
}

// GenerateTokens creates an id_token, access_token, and refresh_token for a user.
func (s *Signer) GenerateTokens(user MockUser, clientID, tenant, nonce, scope, issuer string) (*TokenResponse, error) {
	now := time.Now().Unix()
	exp := now + 3600 // 1 hour

	if tenant == "" {
		tenant = user.TenantID
	}
	if tenant == "" {
		tenant = "common"
	}
	if issuer == "" {
		issuer = fmt.Sprintf("https://login.microsoftonline.com/%s/v2.0", tenant)
	}

	// 1. Build ID Token Claims (Entra v2.0 shape)
	idClaims := map[string]interface{}{
		"iss":                issuer,
		"sub":                user.SubjectID,
		"aud":                clientID,
		"exp":                exp,
		"nbf":                now,
		"iat":                now,
		"oid":                user.ObjectID,
		"tid":                user.TenantID,
		"preferred_username": user.PreferredUsername,
		"name":               user.DisplayName,
		"email":              user.Email,
		"ver":                "2.0",
	}
	if user.GivenName != "" {
		idClaims["given_name"] = user.GivenName
	}
	if user.FamilyName != "" {
		idClaims["family_name"] = user.FamilyName
	}
	if nonce != "" {
		idClaims["nonce"] = nonce
	}
	if len(user.Roles) > 0 {
		idClaims["roles"] = user.Roles
	}
	if len(user.Groups) > 0 {
		idClaims["groups"] = user.Groups
	}
	for k, v := range user.CustomClaims {
		idClaims[k] = v
	}

	idToken, err := s.SignToken(idClaims)
	if err != nil {
		return nil, fmt.Errorf("sign id_token: %w", err)
	}

	// 2. Build Access Token Claims (includes user info for decoding)
	accessClaims := map[string]interface{}{
		"iss":                issuer,
		"sub":                user.SubjectID,
		"aud":                clientID,
		"exp":                exp,
		"nbf":                now,
		"iat":                now,
		"oid":                user.ObjectID,
		"tid":                user.TenantID,
		"scp":                scope,
		"appid":              clientID,
		"ver":                "2.0",
		"email":              user.Email,
		"preferred_username": user.PreferredUsername,
		"name":               user.DisplayName,
	}
	if user.GivenName != "" {
		accessClaims["given_name"] = user.GivenName
	}
	if user.FamilyName != "" {
		accessClaims["family_name"] = user.FamilyName
	}
	if len(user.Roles) > 0 {
		accessClaims["roles"] = user.Roles
	}
	if len(user.Groups) > 0 {
		accessClaims["groups"] = user.Groups
	}
	for k, v := range user.CustomClaims {
		accessClaims[k] = v
	}

	accessToken, err := s.SignToken(accessClaims)
	if err != nil {
		return nil, fmt.Errorf("sign access_token: %w", err)
	}

	// 3. Mock refresh token with user ID and tenant encoded
	refreshTokenPayload := map[string]string{
		"user_id":   user.ID,
		"client_id": clientID,
		"tenant":    tenant,
		"scope":     scope,
	}
	rtBytes, _ := json.Marshal(refreshTokenPayload)
	refreshToken := "rt." + base64.RawURLEncoding.EncodeToString(rtBytes)

	if scope == "" {
		scope = "openid profile email"
	}

	return &TokenResponse{
		TokenType:    "Bearer",
		Scope:        scope,
		ExpiresIn:    3600,
		ExtExpiresIn: 3600,
		AccessToken:  accessToken,
		IDToken:      idToken,
		RefreshToken: refreshToken,
	}, nil
}
