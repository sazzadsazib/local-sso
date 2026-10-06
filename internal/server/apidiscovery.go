package server

import (
	"encoding/json"
	"net/http"
	"sso-local/internal/oauth"
)

func (s *Server) HandleDiscovery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	issuer := r.URL.Query().Get("issuer")
	discURL := r.URL.Query().Get("url")
	if issuer == "" && discURL == "" {
		http.Error(w, `{"error":"missing_issuer_or_url"}`, http.StatusBadRequest)
		return
	}

	doc, err := oauth.FetchDiscovery(r.Context(), nil, issuer, discURL)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":"discovery_failed","error_description":` + jsonQuote(err.Error()) + `}`))
		return
	}
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(doc)
}
