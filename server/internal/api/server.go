// Package api wires HTTP routes to the store. Routing uses Go 1.22+ method
// patterns on the standard mux; no framework needed.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/openroadmap/openroadmap/internal/images"
	"github.com/openroadmap/openroadmap/internal/model"
	"github.com/openroadmap/openroadmap/internal/store"
)

type Config struct {
	SecureCookies bool // set true behind HTTPS
	SessionTTL    time.Duration
}

type Server struct {
	store  store.Store
	images *images.Store
	cfg    Config
	mux    *http.ServeMux
}

func New(st store.Store, img *images.Store, spa fs.FS, cfg Config) *Server {
	if cfg.SessionTTL == 0 {
		cfg.SessionTTL = 30 * 24 * time.Hour
	}
	s := &Server{store: st, images: img, cfg: cfg, mux: http.NewServeMux()}
	s.routes(spa)
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

func (s *Server) routes(spa fs.FS) {
	m := s.mux

	// public
	m.HandleFunc("GET /api/settings", s.getPublicSettings)
	m.HandleFunc("GET /api/roadmaps", s.listRoadmaps)
	m.HandleFunc("GET /api/roadmaps/{slug}", s.getRoadmapBySlug)
	m.HandleFunc("GET /api/roadmaps/{slug}/export", s.exportRoadmap)
	m.HandleFunc("GET /img/{name}", s.getImage)

	// auth
	m.HandleFunc("POST /api/auth/register", s.register)
	m.HandleFunc("POST /api/auth/login", s.login)
	m.HandleFunc("POST /api/auth/logout", s.logout)
	m.HandleFunc("GET /api/auth/me", s.me)

	// signed-in
	m.Handle("GET /api/me/roadmaps", s.requireUser(s.myRoadmaps))
	m.Handle("POST /api/roadmaps", s.requireUser(s.createRoadmap))
	m.Handle("POST /api/roadmaps/import", s.requireUser(s.importRoadmap))
	m.Handle("GET /api/r/{id}", s.requireUser(s.getRoadmapByID))
	m.Handle("PUT /api/r/{id}", s.requireUser(s.updateRoadmap))
	m.Handle("DELETE /api/r/{id}", s.requireUser(s.deleteRoadmap))
	m.Handle("POST /api/r/{id}/submit", s.requireUser(s.submitRoadmap))
	m.Handle("POST /api/r/{id}/publish", s.requireUser(s.publishRoadmap))
	m.Handle("POST /api/r/{id}/unpublish", s.requireUser(s.unpublishRoadmap))
	m.Handle("POST /api/r/{id}/reject", s.requireUser(s.rejectRoadmap))
	m.Handle("GET /api/r/{id}/revisions", s.requireUser(s.listRevisions))
	m.Handle("GET /api/r/{id}/revisions/{n}", s.requireUser(s.getRevision))
	m.Handle("GET /api/r/{id}/progress", s.requireUser(s.getProgress))
	m.Handle("PUT /api/r/{id}/progress", s.requireUser(s.setProgress))
	m.Handle("POST /api/images", s.requireUser(s.uploadImage))

	// admin
	m.Handle("GET /api/admin/review", s.requireAdmin(s.reviewQueue))
	m.Handle("GET /api/admin/users", s.requireAdmin(s.listUsers))
	m.Handle("PUT /api/admin/users/{id}/role", s.requireAdmin(s.setUserRole))
	m.Handle("GET /api/admin/settings", s.requireAdmin(s.getSettings))
	m.Handle("PUT /api/admin/settings", s.requireAdmin(s.putSettings))

	m.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeErr(w, http.StatusNotFound, "no such endpoint")
	})

	// SPA: serve built assets, fall back to index.html for client routes.
	if spa != nil {
		fileServer := http.FileServer(http.FS(spa))
		m.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			p := strings.TrimPrefix(r.URL.Path, "/")
			if p != "" {
				if f, err := spa.Open(p); err == nil {
					f.Close()
					if strings.HasPrefix(p, "assets/") {
						w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
					}
					fileServer.ServeHTTP(w, r)
					return
				}
			}
			r.URL.Path = "/"
			w.Header().Set("Cache-Control", "no-cache")
			fileServer.ServeHTTP(w, r)
		})
	}
}

// ---- helpers ----

type ctxKey int

const userKey ctxKey = 1

const cookieName = "or_session"

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func readJSON(r *http.Request, v any, limit int64) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, limit))
	return dec.Decode(v)
}

func (s *Server) currentUser(r *http.Request) *model.User {
	if u, ok := r.Context().Value(userKey).(*model.User); ok {
		return u
	}
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" {
		return nil
	}
	sess, err := s.store.Session(c.Value)
	if err != nil {
		return nil
	}
	u, err := s.store.UserByID(sess.UserID)
	if err != nil {
		return nil
	}
	return u
}

func (s *Server) requireUser(h func(http.ResponseWriter, *http.Request, *model.User)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := s.currentUser(r)
		if u == nil {
			writeErr(w, http.StatusUnauthorized, "sign in required")
			return
		}
		h(w, r.WithContext(context.WithValue(r.Context(), userKey, u)), u)
	})
}

func (s *Server) requireAdmin(h func(http.ResponseWriter, *http.Request, *model.User)) http.Handler {
	return s.requireUser(func(w http.ResponseWriter, r *http.Request, u *model.User) {
		if u.Role != model.RoleAdmin {
			writeErr(w, http.StatusForbidden, "admin only")
			return
		}
		h(w, r, u)
	})
}

func (s *Server) setSessionCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cfg.SecureCookies,
		SameSite: http.SameSiteLaxMode,
		Expires:  expires,
	})
}

func storeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeErr(w, http.StatusNotFound, "not found")
	case errors.Is(err, store.ErrConflict):
		writeErr(w, http.StatusConflict, "already exists")
	default:
		log.Printf("store error: %v", err)
		writeErr(w, http.StatusInternalServerError, "internal error")
	}
}
