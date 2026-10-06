package oauth

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"
)

// JWKS is a JSON Web Key Set (RFC 7517) as returned by a provider's
// jwks_uri.
type JWKS struct {
	Keys []JWK `json:"keys"`
}

// JWK is a single JSON Web Key. Only the fields relevant to RSA signature
// verification are retained; x5c is the fallback when n/e are absent.
type JWK struct {
	Kty string   `json:"kty"`
	Use string   `json:"use"`
	Kid string   `json:"kid"`
	Alg string   `json:"alg"`
	N   string   `json:"n"`
	E   string   `json:"e"`
	X5c []string `json:"x5c"`
}

// FetchJWKS retrieves a JSON Web Key Set from u.
func FetchJWKS(ctx context.Context, client *http.Client, u string) (*JWKS, error) {
	if err := IsAllowedTarget(u); err != nil {
		return nil, err
	}
	if client == nil {
		client = DefaultHTTPClient()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, fmt.Errorf("build jwks request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch jwks: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jwks endpoint returned %d", resp.StatusCode)
	}
	var set JWKS
	if err := json.NewDecoder(resp.Body).Decode(&set); err != nil {
		return nil, fmt.Errorf("decode jwks: %w", err)
	}
	if len(set.Keys) == 0 {
		return nil, fmt.Errorf("jwks contains no keys")
	}
	return &set, nil
}

// PublicKey resolves the RSA public key for kid from the key set.
func (j *JWKS) PublicKey(kid string) (*rsa.PublicKey, error) {
	for _, k := range j.Keys {
		if k.Kty != "RSA" {
			continue
		}
		if kid != "" && k.Kid != "" && k.Kid != kid {
			continue
		}
		if key, err := k.rsaPublicKey(); err == nil {
			return key, nil
		}
	}
	return nil, fmt.Errorf("no usable RSA key matching kid %q", kid)
}

func (k JWK) rsaPublicKey() (*rsa.PublicKey, error) {
	if k.N != "" && k.E != "" {
		nb, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			return nil, fmt.Errorf("decode modulus: %w", err)
		}
		eb, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			return nil, fmt.Errorf("decode exponent: %w", err)
		}
		e := 0
		for _, b := range eb {
			e = e<<8 | int(b)
		}
		if e <= 0 {
			return nil, fmt.Errorf("invalid exponent")
		}
		return &rsa.PublicKey{N: new(big.Int).SetBytes(nb), E: e}, nil
	}
	if len(k.X5c) > 0 {
		der, err := base64.StdEncoding.DecodeString(k.X5c[0])
		if err != nil {
			return nil, fmt.Errorf("decode x5c certificate: %w", err)
		}
		cert, err := x509.ParseCertificate(der)
		if err != nil {
			return nil, fmt.Errorf("parse x5c certificate: %w", err)
		}
		pub, ok := cert.PublicKey.(*rsa.PublicKey)
		if !ok {
			return nil, fmt.Errorf("x5c certificate is not RSA")
		}
		return pub, nil
	}
	return nil, fmt.Errorf("rsa key has neither n/e nor x5c")
}

// VerifyRS256 checks signature over signingInput for an RS256-signed JWT.
func VerifyRS256(pub *rsa.PublicKey, signingInput, signature []byte) error {
	if pub == nil {
		return fmt.Errorf("nil public key")
	}
	sum := sha256.Sum256(signingInput)
	if err := rsa.VerifyPKCS1v15(pub, crypto.SHA256, sum[:], signature); err != nil {
		return fmt.Errorf("rsa signature verification failed: %w", err)
	}
	return nil
}

// ValidateResult is the outcome of full ID token validation.
type ValidateResult struct {
	Claims   *IDClaims `json:"claims"`
	Verified bool      `json:"verified"`
	Reason   string    `json:"reason,omitempty"`
}

// ValidateIDToken performs structural decode plus cryptographic verification
// of raw (an RS256 JWT) against set, then checks issuer, audience and time
// claims. Every failing check yields Verified=false with a human reason
// instead of an error, so the login window can always render the claims.
//
// audience may be empty to skip the audience check; issuer may be empty to
// skip issuer checking (both reported as skipped reasons).
func ValidateIDToken(ctx context.Context, client *http.Client, raw string, set *JWKS, issuer, audience string) *ValidateResult {
	claims, err := DecodeIDToken(raw)
	if err != nil {
		return &ValidateResult{Verified: false, Reason: "id_token is not a well-formed JWT"}
	}

	parts := strings.Split(raw, ".")
	if len(parts) != 3 || set == nil {
		return &ValidateResult{Claims: claims, Verified: false, Reason: "signature not verified"}
	}
	hdr, err := DecodeHeader(raw)
	if err != nil {
		return &ValidateResult{Claims: claims, Verified: false, Reason: "unparseable JOSE header"}
	}
	alg := hdr["alg"]
	if alg != "RS256" {
		return &ValidateResult{Claims: claims, Verified: false, Reason: "unsupported alg " + alg + " (only RS256 is supported)"}
	}
	key, err := set.PublicKey(hdr["kid"])
	if err != nil {
		return &ValidateResult{Claims: claims, Verified: false, Reason: "no JWKS key for this kid"}
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return &ValidateResult{Claims: claims, Verified: false, Reason: "unparseable signature"}
	}
	if err := VerifyRS256(key, []byte(parts[0]+"."+parts[1]), sig); err != nil {
		return &ValidateResult{Claims: claims, Verified: false, Reason: "signature mismatch"}
	}

	if issuer != "" && !IssuerMatches(issuer, claims.Issuer) {
		return &ValidateResult{Claims: claims, Verified: false, Reason: "issuer mismatch"}
	}
	if audience != "" && !audienceMatches(audience, claims.Audience) {
		return &ValidateResult{Claims: claims, Verified: false, Reason: "audience mismatch"}
	}
	now := time.Now().Unix()
	if claims.ExpirationTime != 0 && now >= claims.ExpirationTime {
		return &ValidateResult{Claims: claims, Verified: false, Reason: "token expired"}
	}
	if claims.NotBefore != 0 && now < claims.NotBefore {
		return &ValidateResult{Claims: claims, Verified: false, Reason: "token not yet valid"}
	}
	return &ValidateResult{Claims: claims, Verified: true}
}

// audienceMatches supports both string and array aud claims.
func audienceMatches(want string, got Audience) bool {
	if got.String() == "" {
		return false
	}
	return got.String() == want || strings.Contains(got.String(), " "+want+" ") ||
		strings.HasPrefix(got.String(), want+" ") || strings.HasSuffix(got.String(), " "+want)
}