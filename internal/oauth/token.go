package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// TokenRequest describes an authorization_code or refresh_token grant.
type TokenRequest struct {
	TokenURL     string
	ClientID     string
	ClientSecret string

	// Required for authorization_code grants.
	Code         string
	CodeVerifier string
	RedirectURI  string
	Scope        string

	// Required for refresh_token grants.
	RefreshToken string

	// Extra sends additional form fields (e.g. Azure "resource").
	Extra map[string]string

	// ClientIDInQuery mirrors client_id into the query string. Microsoft
	// Entra requires this for public-client (PKCE, secretless) redemption.
	ClientIDInQuery bool
}

// TokenResponse is the success body of the token endpoint.
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	Scope        string `json:"scope"`
	ExpiresIn    int64  `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
}

// ProviderError is an OAuth error body returned by the token endpoint.
type ProviderError struct {
	ErrorCode        string `json:"error"`
	ErrorDescription string `json:"error_description"`
	ErrorCodes       []int  `json:"error_codes"`
	TraceID          string `json:"trace_id"`
	CorrelationID    string `json:"correlation_id"`
	Suberror         string `json:"suberror"`
}

func (e *ProviderError) Error() string {
	if e.ErrorDescription != "" {
		return fmt.Sprintf("%s: %s", e.ErrorCode, e.ErrorDescription)
	}
	return e.ErrorCode
}

// DefaultHTTPClient returns an HTTP client with sane timeouts for all
// outbound OAuth calls.
func DefaultHTTPClient() *http.Client {
	return &http.Client{Timeout: 15 * time.Second}
}

// isAllowedTarget reports whether urlStr is safe to call from the server-side
// proxy: both http and https are permitted. This keeps /api/token and
// /api/discovery from being abused as an SSRF relay for arbitrary schemes.
func isAllowedTarget(urlStr string) error {
	u, err := url.Parse(urlStr)
	if err != nil {
		return fmt.Errorf("invalid target url: %w", err)
	}
	if u.Host == "" {
		return fmt.Errorf("invalid target url: missing host")
	}
	switch strings.ToLower(u.Scheme) {
	case "http", "https":
		return nil
	default:
		return fmt.Errorf("unsupported scheme %q in target url", u.Scheme)
	}
}

// IsAllowedTarget exposes the SSRF guard for server-side validation.
func IsAllowedTarget(urlStr string) error { return isAllowedTarget(urlStr) }

// RequestToken performs a token grant against req.TokenURL. It validates the
// target URL, sends the standard form body, and decodes either the token
// response or the provider error.
func RequestToken(ctx context.Context, client *http.Client, req TokenRequest) (*TokenResponse, error) {
	if err := isAllowedTarget(req.TokenURL); err != nil {
		return nil, err
	}
	if client == nil {
		client = DefaultHTTPClient()
	}

	form := url.Values{}
	form.Set("grant_type", grantTypeFor(req))
	if req.Code != "" {
		form.Set("code", req.Code)
	}
	if req.CodeVerifier != "" {
		form.Set("code_verifier", req.CodeVerifier)
	}
	if req.RedirectURI != "" {
		form.Set("redirect_uri", req.RedirectURI)
	}
	if req.RefreshToken != "" {
		form.Set("refresh_token", req.RefreshToken)
	}
	if req.Scope != "" {
		form.Set("scope", req.Scope)
	}
	if req.ClientID != "" {
		form.Set("client_id", req.ClientID)
	}
	if req.ClientSecret != "" {
		form.Set("client_secret", req.ClientSecret)
	}
	for k, v := range req.Extra {
		if v != "" {
			form.Set(k, v)
		}
	}

	endpoint := req.TokenURL
	if req.ClientIDInQuery && req.ClientID != "" {
		sep := "?"
		if strings.Contains(endpoint, "?") {
			sep = "&"
		}
		endpoint += sep + "client_id=" + url.QueryEscape(req.ClientID)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint,
		strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("build token request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	httpReq.Header.Set("Accept", "application/json")

	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("call token endpoint: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read token response: %w", err)
	}

	if resp.StatusCode >= http.StatusBadRequest {
		return nil, decodeTokenError(resp.StatusCode, body)
	}

	var tr TokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return nil, fmt.Errorf("decode token response: %w", err)
	}
	if tr.AccessToken == "" && tr.IDToken == "" {
		return nil, fmt.Errorf("token response contained neither access_token nor id_token")
	}
	return &tr, nil
}

// grantTypeFor derives grant_type from which fields are populated.
func grantTypeFor(req TokenRequest) string {
	if req.RefreshToken != "" && req.Code == "" {
		return "refresh_token"
	}
	return "authorization_code"
}

func decodeTokenError(status int, body []byte) error {
	var pe ProviderError
	if err := json.Unmarshal(body, &pe); err == nil && pe.ErrorCode != "" {
		return fmt.Errorf("token endpoint returned %d (%s): %w", status, pe.ErrorCode, &pe)
	}
	snippet := strings.TrimSpace(string(body))
	if len(snippet) > 300 {
		snippet = snippet[:300] + "…"
	}
	return fmt.Errorf("token endpoint returned %d: %s", status, snippet)
}

// ExchangeCode redeems an authorization code for tokens.
func ExchangeCode(ctx context.Context, client *http.Client, req TokenRequest) (*TokenResponse, error) {
	if req.Code == "" || req.CodeVerifier == "" {
		return nil, fmt.Errorf("code and code_verifier are required for an authorization_code grant")
	}
	return RequestToken(ctx, client, req)
}

// Refresh redeems a refresh token for new tokens.
func Refresh(ctx context.Context, client *http.Client, req TokenRequest) (*TokenResponse, error) {
	if req.RefreshToken == "" {
		return nil, fmt.Errorf("refresh_token is required for a refresh_token grant")
	}
	return RequestToken(ctx, client, req)
}