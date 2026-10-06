package server

import (
	"encoding/json"
	"io"
	"net/http"
	"sso-local/internal/idp"
	"strings"
)

// HandleUsers handles GET /api/users and POST /api/users.
func (s *Server) HandleUsers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	switch r.Method {
	case http.MethodGet:
		users := s.UserStore.List()
		_ = json.NewEncoder(w).Encode(users)

	case http.MethodPost:
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<18))
		if err != nil {
			http.Error(w, `{"error":"bad_request"}`, http.StatusBadRequest)
			return
		}
		var user idp.MockUser
		if err := json.Unmarshal(body, &user); err != nil {
			http.Error(w, `{"error":"invalid_json"}`, http.StatusBadRequest)
			return
		}
		if user.DisplayName == "" || user.Email == "" {
			http.Error(w, `{"error":"missing_name_or_email"}`, http.StatusBadRequest)
			return
		}

		created := s.UserStore.Create(user)
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(created)

	default:
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
	}
}

// HandleUserByID handles GET, PUT, and DELETE on /api/users/{id}.
func (s *Server) HandleUserByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	id := strings.TrimPrefix(r.URL.Path, "/api/users/")
	if id == "" {
		http.Error(w, `{"error":"missing_user_id"}`, http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		user, ok := s.UserStore.Get(id)
		if !ok {
			http.Error(w, `{"error":"user_not_found"}`, http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(user)

	case http.MethodPut:
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<18))
		if err != nil {
			http.Error(w, `{"error":"bad_request"}`, http.StatusBadRequest)
			return
		}
		var user idp.MockUser
		if err := json.Unmarshal(body, &user); err != nil {
			http.Error(w, `{"error":"invalid_json"}`, http.StatusBadRequest)
			return
		}
		updated, err := s.UserStore.Update(id, user)
		if err != nil {
			http.Error(w, `{"error":"user_not_found"}`, http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(updated)

	case http.MethodDelete:
		err := s.UserStore.Delete(id)
		if err != nil {
			http.Error(w, `{"error":"user_not_found"}`, http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"deleted"}`))

	default:
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
	}
}
