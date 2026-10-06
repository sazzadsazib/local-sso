package idp

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"sync"
)

// KeyManager manages RSA signing keys for the local mock IdP.
type KeyManager struct {
	mu         sync.RWMutex
	privateKey *rsa.PrivateKey
	keyID      string
}

// JWK represents a JSON Web Key for RSA public keys.
type JWK struct {
	Kty string `json:"kty"`
	Use string `json:"use"`
	Kid string `json:"kid"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// JWKS represents a JSON Web Key Set.
type JWKS struct {
	Keys []JWK `json:"keys"`
}

// NewKeyManager initializes and generates an RSA 2048-bit key pair.
func NewKeyManager() (*KeyManager, error) {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("generate rsa key: %w", err)
	}
	return &KeyManager{
		privateKey: priv,
		keyID:      "sso-local-key-1",
	}, nil
}

// KeyID returns the active key ID.
func (km *KeyManager) KeyID() string {
	km.mu.RLock()
	defer km.mu.RUnlock()
	return km.keyID
}

// PrivateKey returns the active RSA private key.
func (km *KeyManager) PrivateKey() *rsa.PrivateKey {
	km.mu.RLock()
	defer km.mu.RUnlock()
	return km.privateKey
}

// JWKS returns the public JWKS representation of the active key.
func (km *KeyManager) JWKS() JWKS {
	km.mu.RLock()
	defer km.mu.RUnlock()

	pub := &km.privateKey.PublicKey
	nBytes := pub.N.Bytes()
	eBytes := big.NewInt(int64(pub.E)).Bytes()

	jwk := JWK{
		Kty: "RSA",
		Use: "sig",
		Kid: km.keyID,
		Alg: "RS256",
		N:   base64.RawURLEncoding.EncodeToString(nBytes),
		E:   base64.RawURLEncoding.EncodeToString(eBytes),
	}

	return JWKS{
		Keys: []JWK{jwk},
	}
}

// JWKSJSON returns the JWKS serialized as JSON bytes.
func (km *KeyManager) JWKSJSON() ([]byte, error) {
	return json.MarshalIndent(km.JWKS(), "", "  ")
}
