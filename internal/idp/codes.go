package idp

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"sync"
	"time"
)

// AuthCodeData holds state associated with an issued authorization code.
type AuthCodeData struct {
	Code                string
	ClientID            string
	RedirectURI         string
	CodeChallenge       string
	CodeChallengeMethod string
	Nonce               string
	Scope               string
	User                MockUser
	Tenant              string
	CreatedAt           time.Time
	ExpiresAt           time.Time
}

// CodeStore manages active authorization codes with thread safety.
type CodeStore struct {
	mu    sync.RWMutex
	codes map[string]AuthCodeData
}

// NewCodeStore creates a new code store.
func NewCodeStore() *CodeStore {
	return &CodeStore{
		codes: make(map[string]AuthCodeData),
	}
}

// CreateCode generates and saves a new authorization code valid for 5 minutes.
func (cs *CodeStore) CreateCode(clientID, redirectURI, challenge, method, nonce, scope, tenant string, user MockUser) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate code: %w", err)
	}
	code := "oa." + base64.RawURLEncoding.EncodeToString(b)

	now := time.Now()
	data := AuthCodeData{
		Code:                code,
		ClientID:            clientID,
		RedirectURI:         redirectURI,
		CodeChallenge:       challenge,
		CodeChallengeMethod: method,
		Nonce:               nonce,
		Scope:               scope,
		User:                user,
		Tenant:              tenant,
		CreatedAt:           now,
		ExpiresAt:           now.Add(5 * time.Minute),
	}

	cs.mu.Lock()
	defer cs.mu.Unlock()

	// Clean expired codes occasionally
	for k, v := range cs.codes {
		if now.After(v.ExpiresAt) {
			delete(cs.codes, k)
		}
	}

	cs.codes[code] = data
	return code, nil
}

// ExchangeCode validates and single-use consumes an authorization code with PKCE verification.
func (cs *CodeStore) ExchangeCode(code, clientID, codeVerifier, redirectURI string) (*AuthCodeData, error) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	data, ok := cs.codes[code]
	if !ok {
		return nil, errors.New("invalid_grant: authorization code not found or already used")
	}

	// Single-use: delete immediately
	delete(cs.codes, code)

	if time.Now().After(data.ExpiresAt) {
		return nil, errors.New("invalid_grant: authorization code expired")
	}

	if data.ClientID != "" && clientID != "" && data.ClientID != clientID {
		return nil, errors.New("invalid_grant: client_id mismatch")
	}

	if data.RedirectURI != "" && redirectURI != "" && data.RedirectURI != redirectURI {
		return nil, errors.New("invalid_grant: redirect_uri mismatch")
	}

	// Validate PKCE if challenge was registered
	if data.CodeChallenge != "" {
		if codeVerifier == "" {
			return nil, errors.New("invalid_grant: code_verifier is required for PKCE")
		}
		var computedChallenge string
		if data.CodeChallengeMethod == "plain" {
			computedChallenge = codeVerifier
		} else {
			// S256 default
			sum := sha256.Sum256([]byte(codeVerifier))
			computedChallenge = base64.RawURLEncoding.EncodeToString(sum[:])
		}

		if subtle.ConstantTimeCompare([]byte(computedChallenge), []byte(data.CodeChallenge)) != 1 {
			return nil, errors.New("invalid_grant: PKCE code_verifier verification failed")
		}
	}

	return &data, nil
}
