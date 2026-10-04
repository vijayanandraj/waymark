package api

import (
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/openroadmap/openroadmap/internal/auth"
	"github.com/openroadmap/openroadmap/internal/model"
)

type credentials struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var c credentials
	if err := readJSON(r, &c, 1<<16); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	c.Email = strings.TrimSpace(strings.ToLower(c.Email))
	c.Name = strings.TrimSpace(c.Name)
	if _, err := mail.ParseAddress(c.Email); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid email")
		return
	}
	if len(c.Password) < 8 {
		writeErr(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	if c.Name == "" {
		c.Name = strings.SplitN(c.Email, "@", 2)[0]
	}
	n, err := s.store.CountUsers()
	if err != nil {
		storeErr(w, err)
		return
	}
	settings, _ := s.store.Settings()
	if n > 0 && !settings.OpenSignup {
		writeErr(w, http.StatusForbidden, "sign-up is closed on this instance; ask an admin for an account")
		return
	}
	hash, err := auth.HashPassword(c.Password)
	if err != nil {
		storeErr(w, err)
		return
	}
	u := &model.User{
		ID:           auth.ID(),
		Email:        c.Email,
		Name:         c.Name,
		Role:         model.RoleMember,
		PasswordHash: hash,
		CreatedAt:    time.Now(),
	}
	if n == 0 {
		u.Role = model.RoleAdmin // first account administers the instance
	}
	if err := s.store.CreateUser(u); err != nil {
		storeErr(w, err)
		return
	}
	s.startSession(w, u)
	writeJSON(w, http.StatusCreated, u)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var c credentials
	if err := readJSON(r, &c, 1<<16); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	u, err := s.store.UserByEmail(strings.TrimSpace(strings.ToLower(c.Email)))
	if err != nil || !auth.VerifyPassword(u.PasswordHash, c.Password) {
		// Same response either way so emails cannot be enumerated.
		writeErr(w, http.StatusUnauthorized, "wrong email or password")
		return
	}
	s.startSession(w, u)
	writeJSON(w, http.StatusOK, u)
}

func (s *Server) startSession(w http.ResponseWriter, u *model.User) {
	sess := &model.Session{Token: auth.Token(), UserID: u.ID, ExpiresAt: time.Now().Add(s.cfg.SessionTTL)}
	_ = s.store.CreateSession(sess)
	s.setSessionCookie(w, sess.Token, sess.ExpiresAt)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		_ = s.store.DeleteSession(c.Value)
	}
	s.setSessionCookie(w, "", time.Unix(0, 0))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u := s.currentUser(r)
	if u == nil {
		writeJSON(w, http.StatusOK, map[string]any{"user": nil})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}
