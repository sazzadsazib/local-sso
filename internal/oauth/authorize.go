package oauth

import (
	"fmt"
	"net/url"
	"strings"
)

// Provider kinds supported by the tool.
const (
	ProviderEntra   = "entra"
	ProviderGeneric = "generic"
)

// Entra path constants for Microsoft Entra ID (Azure AD) v2.0 endpoints.
const (
	entraLoginBase = "https://login.microsoftonline.com"
	pathAuthorize  = "/oauth2/v2.0/authorize"
	pathToken      = "/oauth2/v2.0/token"
	pathLogout     = "/oauth2/v2.0/logout"
	pathDiscovery  = "/v2.0/.well-known/openid-configuration"
)

// EntraEndpoints derives the v2.0 authorize, token and logout endpoints plus
// the discovery document URL for an Entra tenant alias. tenant may be one of:
// "common", "organizations", "consumers", a tenant GUID or a verified domain.
func EntraEndpoints(tenant string) (authorize, token, logout, discovery string) {
	t := strings.TrimSpace(tenant)
	if t == "" {
		t = "common"
	}
	base := entraLoginBase + "/" + url.PathEscape(t)
	return base + pathAuthorize, base + pathToken, base + pathLogout, base + pathDiscovery
}

// AuthorizeParams is the full input needed to assemble an authorize request.
type AuthorizeParams struct {
	Endpoint            string
	ClientID            string
	RedirectURI         string
	Scope               string
	State               string
	Nonce               string
	CodeChallenge       string
	CodeChallengeMethod string
	ResponseType        string // defaults to "code"
	ResponseMode        string // defaults to "query"
	Prompt              string // optional, e.g. "select_account"
	LoginHint           string // optional, pre-fills the login name
	Extra               map[string]string
}

// BuildAuthorizeURL assembles the authorization endpoint URL with an ordered,
// deterministic query string. Order does not affect the protocol but keeps the
// generated link readable and trivially assertable in tests.
func BuildAuthorizeURL(p AuthorizeParams) (string, error) {
	if p.Endpoint == "" {
		return "", fmt.Errorf("authorize endpoint is required")
	}
	if p.ClientID == "" {
		return "", fmt.Errorf("client id is required")
	}
	if p.RedirectURI == "" {
		return "", fmt.Errorf("redirect uri is required")
	}
	endpoint, err := url.Parse(p.Endpoint)
	if err != nil {
		return "", fmt.Errorf("parse authorize endpoint: %w", err)
	}

	responseType, responseMode := p.ResponseType, p.ResponseMode
	if responseType == "" {
		responseType = "code"
	}
	if responseMode == "" {
		responseMode = "query"
	}
	method := p.CodeChallengeMethod
	if method == "" {
		method = CodeChallengeMethodS256
	}

	var ordered [][2]string
	ordered = append(ordered,
		[2]string{"client_id", p.ClientID},
		[2]string{"response_type", responseType},
		[2]string{"redirect_uri", p.RedirectURI},
		[2]string{"response_mode", responseMode},
	)
	optional := [][2]string{
		{"scope", p.Scope},
		{"state", p.State},
		{"nonce", p.Nonce},
		{"code_challenge", p.CodeChallenge},
		{"prompt", p.Prompt},
		{"login_hint", p.LoginHint},
	}
	for _, kv := range optional {
		if kv[1] != "" {
			ordered = append(ordered, kv)
		}
	}
	if p.CodeChallenge != "" {
		ordered = append(ordered, [2]string{"code_challenge_method", method})
	}
	if len(p.Extra) > 0 {
		keys := make([]string, 0, len(p.Extra))
		for k := range p.Extra {
			keys = append(keys, k)
		}
		sortStrings(keys)
		for _, k := range keys {
			if v := p.Extra[k]; v != "" {
				ordered = append(ordered, [2]string{k, v})
			}
		}
	}

	var b strings.Builder
	b.WriteString(endpoint.Scheme + "://" + endpoint.Host + endpoint.EscapedPath())
	b.WriteByte('?')

	// Preserve any raw query the endpoint already carried, verbatim.
	if endpoint.RawQuery != "" {
		b.WriteString(endpoint.RawQuery)
		for _, kv := range ordered {
			b.WriteByte('&')
			writeQueryPair(&b, kv[0], kv[1])
		}
		return b.String(), nil
	}

	for i, kv := range ordered {
		if i > 0 {
			b.WriteByte('&')
		}
		writeQueryPair(&b, kv[0], kv[1])
	}
	return b.String(), nil
}

func writeQueryPair(b *strings.Builder, k, v string) {
	b.WriteString(url.QueryEscape(k))
	b.WriteByte('=')
	b.WriteString(url.QueryEscape(v))
}

// sortStrings is a tiny insertion sort; a handful of keys do not warrant a
// dependency-heavy approach, and it keeps output stable without importing sort.
func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}