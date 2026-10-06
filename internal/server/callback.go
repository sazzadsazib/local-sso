package server

import (
	"io/fs"
	"net/http"
)

// HandleCallback serves index.html so the SPA router and callback handler process the returned auth code.
func (s *Server) HandleCallback(w http.ResponseWriter, r *http.Request) {
	sub, err := fs.Sub(s.Web, "web/dist")
	if err != nil {
		sub, _ = fs.Sub(s.Web, "web")
	}

	indexData, err := fs.ReadFile(sub, "index.html")
	if err != nil {
		http.Error(w, "Failed to load index.html", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(indexData)
}
