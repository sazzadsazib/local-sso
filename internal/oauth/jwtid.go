package oauth

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// Audience accepts the JWT aud claim when serialized as either a plain string
// or an array of strings (RFC 7519 section 4.1.3), joining arrays with spaces.
type Audience string

// UnmarshalJSON implements json.Unmarshaler for both aud shapes.
func (a *Audience) UnmarshalJSON(data []byte) error {
	data = bytes.TrimSpace(data)
	if len(data) == 0 || string(data) == "null" {
		*a = ""
		return nil
	}
	if data[0] == '"' {
		var s string
		if err := json.Unmarshal(data, &s); err != nil {
			return err
		}
		*a = Audience(s)
		return nil
	}
	var arr []string
	if err := json.Unmarshal(data, &arr); err != nil {
		return err
	}
	*a = Audience(strings.Join(arr, " "))
	return nil
}

// String renders the audience list.
func (a Audience) String() string { return string(a) }

// Claims holds the subset of OIDC ID token claims sso-local surfaces in the
// login window. Microsoft Entra specific claims (oid/tid) are empty for other
// providers.
type IDClaims struct {
	Issuer            string   `json:"iss"`
	Subject           string   `json:"sub"`
	Audience          Audience `json:"aud"`
	ExpirationTime    int64    `json:"exp"`
	NotBefore         int64    `json:"nbf"`
	IssuedAt          int64    `json:"iat"`
	Nonce             string   `json:"nonce"`
	Email             string   `json:"email"`
	PreferredUsername string   `json:"preferred_username"`
	Name              string   `json:"name"`
	GivenName         string   `json:"given_name"`
	FamilyName        string   `json:"family_name"`
	ObjectID          string   `json:"oid"` // Microsoft Entra directory object id
	TenantID          string   `json:"tid"` // Microsoft Entra tenant id
	Roles             []string `json:"roles"`
}

// Identity returns the best available display identity for the login window:
// email, falling back to preferred_username, then subject.
func (c *IDClaims) Identity() string {
	if c == nil {
		return ""
	}
	switch {
	case c.Email != "":
		return c.Email
	case c.PreferredUsername != "":
		return c.PreferredUsername
	default:
		return c.Subject
	}
}

// ErrNotJWT is returned when the input does not have JWT's three-part shape.
var ErrNotJWT = errors.New("token is not a three-part JWT")

// DecodeIDToken parses an unsigned JWT, validating its structure but not its
// cryptographic signature. Signature verification is performed separately
// against the provider JWKS (see jwks.go / server.ValidateIDToken).
func DecodeIDToken(raw string) (*IDClaims, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return nil, ErrNotJWT
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("decode id_token payload: %w", err)
	}
	var claims IDClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("unmarshal id_token claims: %w", err)
	}
	return &claims, nil
}

// DecodeHeader parses the JOSE header (alg/kid/typ) of a JWT.
func DecodeHeader(raw string) (map[string]string, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return nil, ErrNotJWT
	}
	hdr, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("decode id_token header: %w", err)
	}
	var out map[string]string
	if err := json.Unmarshal(hdr, &out); err != nil {
		return nil, fmt.Errorf("unmarshal id_token header: %w", err)
	}
	return out, nil
}