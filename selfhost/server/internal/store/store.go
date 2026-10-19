// Package store defines the persistence interface and ships a file-backed
// implementation that needs no external services: everything lives as JSON
// under one data directory, which makes backup, inspection and version
// control trivial. A SQL implementation only has to satisfy Store.
package store

import (
	"errors"

	"github.com/openroadmap/openroadmap/internal/model"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
)

type RoadmapFilter struct {
	Status  model.Status // "" = any
	OwnerID string       // "" = any
	Query   string       // case-insensitive match on title/subtitle/tags
	Tag     string
}

type Store interface {
	// Users
	CreateUser(u *model.User) error
	UserByID(id string) (*model.User, error)
	UserByEmail(email string) (*model.User, error)
	ListUsers() ([]*model.User, error)
	UpdateUser(u *model.User) error
	CountUsers() (int, error)

	// Sessions
	CreateSession(s *model.Session) error
	Session(token string) (*model.Session, error)
	DeleteSession(token string) error

	// Roadmaps
	CreateRoadmap(r *model.Roadmap) error
	RoadmapByID(id string) (*model.Roadmap, error)
	RoadmapBySlug(slug string) (*model.Roadmap, error)
	ListRoadmaps(f RoadmapFilter) ([]*model.Roadmap, error)
	UpdateRoadmap(r *model.Roadmap) error
	DeleteRoadmap(id string) error

	// Revisions
	AddRevision(rev *model.Revision) error
	ListRevisions(roadmapID string) ([]*model.Revision, error)
	Revision(roadmapID string, n int) (*model.Revision, error)

	// Progress
	Progress(userID, roadmapID string) (model.Progress, error)
	SetProgress(userID, roadmapID string, p model.Progress) error

	// Settings
	Settings() (model.Settings, error)
	SaveSettings(s model.Settings) error

	Close() error
}
