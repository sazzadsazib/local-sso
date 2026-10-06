package idp

import (
	"fmt"
)

// OpenIDConfiguration represents standard OIDC metadata document.
type OpenIDConfiguration struct {
	Issuer                                string   `json:"issuer"`
	AuthorizationEndpoint                 string   `json:"authorization_endpoint"`
	TokenEndpoint                         string   `json:"token_endpoint"`
	TokenEndpointAuthMethodsSupported     []string `json:"token_endpoint_auth_methods_supported"`
	JWKSURI                               string   `json:"jwks_uri"`
	ResponseModesSupported                []string `json:"response_modes_supported"`
	ResponseTypesSupported                []string `json:"response_types_supported"`
	ScopesSupported                       []string `json:"scopes_supported"`
	SubjectTypesSupported                 []string `json:"subject_types_supported"`
	IDTokenSigningAlgValuesSupported      []string `json:"id_token_signing_alg_values_supported"`
	EndSessionEndpoint                    string   `json:"end_session_endpoint"`
	CodeChallengeMethodsSupported         []string `json:"code_challenge_methods_supported"`
	ClaimsSupported                       []string `json:"claims_supported"`
}

// GenerateDiscovery creates OIDC metadata customized for the given host, port, and tenant.
func GenerateDiscovery(host string, port int, tenant string) OpenIDConfiguration {
	if tenant == "" {
		tenant = "common"
	}
	base := fmt.Sprintf("http://%s:%d/%s", host, port, tenant)

	return OpenIDConfiguration{
		Issuer:                fmt.Sprintf("https://login.microsoftonline.com/%s/v2.0", tenant),
		AuthorizationEndpoint: fmt.Sprintf("%s/oauth2/v2.0/authorize", base),
		TokenEndpoint:         fmt.Sprintf("%s/oauth2/v2.0/token", base),
		TokenEndpointAuthMethodsSupported: []string{
			"client_secret_post",
			"client_secret_basic",
			"none",
		},
		JWKSURI: fmt.Sprintf("%s/discovery/v2.0/keys", base),
		ResponseModesSupported: []string{
			"query",
			"fragment",
			"form_post",
		},
		ResponseTypesSupported: []string{
			"code",
			"id_token",
			"code id_token",
			"token",
		},
		ScopesSupported: []string{
			"openid",
			"profile",
			"email",
			"offline_access",
		},
		SubjectTypesSupported: []string{
			"pairwise",
			"public",
		},
		IDTokenSigningAlgValuesSupported: []string{
			"RS256",
		},
		EndSessionEndpoint: fmt.Sprintf("%s/oauth2/v2.0/logout", base),
		CodeChallengeMethodsSupported: []string{
			"S256",
			"plain",
		},
		ClaimsSupported: []string{
			"sub",
			"iss",
			"aud",
			"exp",
			"nbf",
			"iat",
			"name",
			"preferred_username",
			"email",
			"oid",
			"tid",
			"roles",
			"groups",
			"ver",
		},
	}
}
