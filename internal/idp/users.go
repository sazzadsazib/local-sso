package idp

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
)

// MockUser defines an identity in the local IdP directory.
type MockUser struct {
	ID                string                 `json:"id"`
	DisplayName       string                 `json:"name"`
	GivenName         string                 `json:"given_name,omitempty"`
	FamilyName        string                 `json:"family_name,omitempty"`
	Email             string                 `json:"email"`
	PreferredUsername string                 `json:"preferred_username"`
	TenantID          string                 `json:"tid"`
	ObjectID          string                 `json:"oid"`
	SubjectID         string                 `json:"sub"`
	Roles             []string               `json:"roles,omitempty"`
	Groups            []string               `json:"groups,omitempty"`
	CustomClaims      map[string]interface{} `json:"custom_claims,omitempty"`
}

// UserStore manages in-memory mock users.
type UserStore struct {
	mu    sync.RWMutex
	users map[string]MockUser
}

func randomUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// NewUserStore initializes the store seeded with realistic Microsoft personas.
func NewUserStore() *UserStore {
	store := &UserStore{
		users: make(map[string]MockUser),
	}

	defaultTenant := "72f988bf-86f1-41af-91ab-2d7cd011db47" // Sample Contoso Tenant GUID

	u1 := MockUser{
		ID:                "user-1",
		DisplayName:       "Sazzad Sazib",
		GivenName:         "Sazzad",
		FamilyName:        "Sazib",
		Email:             "sazib@gmail.com",
		PreferredUsername: "sazib@gmail.com",
		TenantID:          defaultTenant,
		ObjectID:          "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
		SubjectID:         "sub-sazzad-sazib-001",
		Roles:             []string{"Global Administrator", "User"},
		Groups:            []string{"Engineers", "Admins"},
		CustomClaims: map[string]interface{}{
			"department": "Engineering",
			"job_title":  "Principal Security Engineer",
		},
	}

	u2 := MockUser{
		ID:                "user-2",
		DisplayName:       "Iftekhar Rifat",
		GivenName:         "Iftekhar",
		FamilyName:        "Rifat",
		Email:             "rifat@gmail.com",
		PreferredUsername: "rifat@gmail.com",
		TenantID:          defaultTenant,
		ObjectID:          "f6e5d4c3-b2a1-4f5e-9d8c-7b6a5f4e3d2c",
		SubjectID:         "sub-iftekhar-rifat-002",
		Roles:             []string{"Application Developer", "User"},
		Groups:            []string{"Developers"},
		CustomClaims: map[string]interface{}{
			"department": "Product Development",
			"job_title":  "Senior Software Engineer",
		},
	}

	store.users[u1.ID] = u1
	store.users[u2.ID] = u2

	return store
}

// List returns all mock users, sorted deterministically by ID.
func (s *UserStore) List() []MockUser {
	s.mu.RLock()
	defer s.mu.RUnlock()
	list := make([]MockUser, 0, len(s.users))
	for _, u := range s.users {
		list = append(list, u)
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].ID < list[j].ID
	})
	return list
}

// Get finds a user by ID, preferred_username, email, or display name (case-insensitive).
func (s *UserStore) Get(idOrEmail string) (MockUser, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	trimmed := strings.TrimSpace(idOrEmail)
	if u, ok := s.users[trimmed]; ok {
		return u, true
	}
	for _, u := range s.users {
		if strings.EqualFold(u.Email, trimmed) ||
			strings.EqualFold(u.PreferredUsername, trimmed) ||
			u.ID == trimmed ||
			u.SubjectID == trimmed ||
			u.ObjectID == trimmed ||
			strings.EqualFold(u.DisplayName, trimmed) {
			return u, true
		}
	}
	return MockUser{}, false
}

// Create adds a new user with auto-generated IDs if not provided.
func (s *UserStore) Create(user MockUser) MockUser {
	s.mu.Lock()
	defer s.mu.Unlock()

	if user.ID == "" {
		b := make([]byte, 4)
		_, _ = rand.Read(b)
		user.ID = "user-" + hex.EncodeToString(b)
	}
	if user.TenantID == "" {
		user.TenantID = "72f988bf-86f1-41af-91ab-2d7cd011db47"
	}
	if user.ObjectID == "" {
		user.ObjectID = randomUUID()
	}
	if user.SubjectID == "" {
		user.SubjectID = "sub-" + user.ID
	}
	if user.PreferredUsername == "" {
		user.PreferredUsername = user.Email
	}

	s.users[user.ID] = user
	return user
}

// Update modifies an existing mock user.
func (s *UserStore) Update(id string, user MockUser) (MockUser, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.users[id]; !ok {
		return MockUser{}, errors.New("user not found")
	}
	user.ID = id
	s.users[id] = user
	return user, nil
}

// Delete removes a user.
func (s *UserStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.users[id]; !ok {
		return errors.New("user not found")
	}
	delete(s.users, id)
	return nil
}
