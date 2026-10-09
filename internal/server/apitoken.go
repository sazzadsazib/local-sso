package server

import (
	"encoding/json"
	"io"
	"net/http"
	"local-sso/internal/oauth"
)

type tokenAPIRequest struct {
	TokenURL        string            `json:"token_url"`
	ClientID        string            `json:"client_id"`
	ClientSecret    string            `json:"client_secret"`
	Code            string            `json:"code"`
	CodeVerifier    string            `json:"code_verifier"`
	RedirectURI     string            `json:"redirect_uri"`
	Scope           string            `json:"scope"`
	RefreshToken    string            `json:"refresh_token"`
	Extra           map[string]string `json:"extra"`
	ClientIDInQuery bool              `json:"client_id_in_query"`
}

func (s *Server) HandleTokenProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<18))
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	var req tokenAPIRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	tr := oauth.TokenRequest{
		TokenURL:        req.TokenURL,
		ClientID:        req.ClientID,
		ClientSecret:    req.ClientSecret,
		Code:            req.Code,
		CodeVerifier:    req.CodeVerifier,
		RedirectURI:     req.RedirectURI,
		Scope:           req.Scope,
		RefreshToken:    req.RefreshToken,
		Extra:           req.Extra,
		ClientIDInQuery: req.ClientIDInQuery,
	}

	resp, err := oauth.RequestToken(r.Context(), nil, tr)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":"token_exchange_failed","error_description":` + jsonQuote(err.Error()) + `}`))
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func jsonQuote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
