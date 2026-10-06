// Package oauth implements the OAuth 2.0 / OpenID Connect primitives used by
// sso-local: PKCE, authorize URL construction, token exchange, discovery and
// ID token handling.
package oauth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
)

// CodeChallengeMethodS256 is the only PKCE challenge method supported by
// sso-local, as recommended by RFC 9207 guidance for public clients.
const CodeChallengeMethodS256 = "S256"

// randomB64 returns a URL-safe base64 string without padding derived from n
// cryptographically secure random bytes.
func randomB64(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate random bytes: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// GenerateCodeVerifier returns a PKCE code_verifier meeting RFC 7636's
// length requirement (43..128 characters of the unreserved set). 32 random
// bytes base64url encoded yields a 43 character verifier.
func GenerateCodeVerifier() (string, error) {
	return randomB64(32)
}

// CodeChallengeS256 computes BASE64URL-ENCODE(SHA256(ASCII(verifier))) as
// specified in RFC 7636 section 4.2.
func CodeChallengeS256(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// GenerateState returns an unpredictable anti-CSRF state value.
func GenerateState() (string, error) {
	return randomB64(32)
}

// GenerateNonce returns an unpredictable OIDC nonce value.
func GenerateNonce() (string, error) {
	return randomB64(32)
}

// StatesEqual reports whether a and b are equal, comparing them in constant
// time so response state comparisons do not leak timing information.
func StatesEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// VerifyVerifierAndChallenge reports whether verifier hashes to challenge under
// S256. It exists so callers (and tests) can assert PKCE material integrity
// before starting a flow.
func VerifyVerifierAndChallenge(verifier, challenge string) bool {
	if verifier == "" || challenge == "" {
		return false
	}
	return CodeChallengeS256(verifier) == challenge
}