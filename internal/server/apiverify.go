package server

import (
	"encoding/json"
	"io"
	"net/http"
	"sso-local/internal/oauth"
)

type verifyRequest struct {
	IDToken  string `json:"id_token"`
	JWKSURI  string `json:"jwks_uri"`
	Issuer   string `json:"issuer"`
	Audience string `json:"audience"`
}

func (s *Server) HandleVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<19))
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	var req verifyRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if req.IDToken == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"verified":false,"reason":"missing id_token"}`))
		return
	}

	var jwks *oauth.JWKS
	if req.JWKSURI != "" {
		if set, err := oauth.FetchJWKS(r.Context(), nil, req.JWKSURI); err == nil {
			jwks = set
		}
	}

	res := oauth.ValidateIDToken(r.Context(), nil, req.IDToken, jwks, req.Issuer, req.Audience)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(res)
}
