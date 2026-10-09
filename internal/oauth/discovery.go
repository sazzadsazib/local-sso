package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// DiscoveryDocument is the subset of an OpenID Provider Configuration document
// (/.well-known/openid-configuration) that local-sso consumes.
type DiscoveryDocument struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	EndSessionEndpoint    string `json:"end_session_endpoint"`
	UserinfoEndpoint      string `json:"userinfo_endpoint"`
	JWKSURI               string `json:"jwks_uri"`
	IDTokenSigningAlgValues []string `json:"id_token_signing_alg_values_supported"`
	ScopesSupported       []string `json:"scopes_supported"`
	GrantTypesSupported   []string `json:"grant_types_supported"`
	ClaimsSupported       []string `json:"claims_supported"`
}

// endpointForDiscovery resolves the discovery document URL from the well-known
// pattern of https://host/.well-known/openid-configuration for a given issuer.
func endpointForDiscovery(issuer string) (string, error) {
	if err := IsAllowedTarget(issuer); err != nil {
		return "", err
	}
	issuer = strings.TrimSuffix(issuer, "/")
	if strings.HasSuffix(issuer, "/.well-known/openid-configuration") {
		return issuer, nil
	}
	return issuer + "/.well-known/openid-configuration", nil
}

// FetchDiscovery retrieves and decodes the OpenID Provider Configuration
// document for issuer. discoveryURL, when non-empty, overrides derivation.
func FetchDiscovery(ctx context.Context, client *http.Client, issuer, discoveryURL string) (*DiscoveryDocument, error) {
	target := discoveryURL
	if target == "" {
		var err error
		if target, err = endpointForDiscovery(issuer); err != nil {
			return nil, err
		}
	} else if err := IsAllowedTarget(target); err != nil {
		return nil, err
	}

	if client == nil {
		client = DefaultHTTPClient()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, fmt.Errorf("build discovery request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch discovery document: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("discovery document returned %d for %s", resp.StatusCode, target)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read discovery document: %w", err)
	}
	var doc DiscoveryDocument
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, fmt.Errorf("decode discovery document: %w", err)
	}
	if doc.Issuer == "" {
		return nil, fmt.Errorf("discovery document missing issuer")
	}
	return &doc, nil
}

// IssuerMatches reports whether an ID token's iss claim matches the discovery
// document issuer. Entra's "common"/"organizations"/"consumers" discovery
// endpoints publish either a literal "{tenantid}" placeholder or the alias
// itself in place of the real tenant GUID, so only discovery-side aliases are
// normalized; tenant-specific issuers are compared strictly.
func IssuerMatches(discovered, actual string) bool {
	if discovered == "" || actual == "" {
		return false
	}
	if discovered == actual {
		return true
	}
	pattern := strings.ReplaceAll(discovered, "{tenantid}", "*")
	dParts := strings.Split(strings.TrimSuffix(pattern, "/"), "/")
	aParts := strings.Split(strings.TrimSuffix(actual, "/"), "/")
	if len(dParts) != len(aParts) {
		return false
	}

	// Only well-known placeholder aliases on the discovered side are wildcards.
	// A tenant-specific discovery document never loosens matches.
	hasAlias := false
	for i, dp := range dParts {
		if dp == "*" || dp == "common" || dp == "organizations" || dp == "consumers" {
			dParts[i] = "*"
			hasAlias = true
			continue
		}
	}
	if !hasAlias {
		return false
	}
	for i, dp := range dParts {
		if dp == "*" {
			continue
		}
		if dp != aParts[i] {
			return false
		}
	}
	return true
}