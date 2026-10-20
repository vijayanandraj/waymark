// Package model holds the persisted types shared by the store and the API.
package model

import (
	"encoding/json"
	"time"
)

// Role of a user on this instance.
type Role string

const (
	RoleAdmin  Role = "admin"
	RoleMember Role = "member"
)

// Status of a roadmap in its editorial lifecycle.
type Status string

const (
	StatusDraft     Status = "draft"
	StatusReview    Status = "review"
	StatusPublished Status = "published"
)

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	Name         string    `json:"name"`
	Role         Role      `json:"role"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Session struct {
	Token     string    `json:"token"`
	UserID    string    `json:"userId"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// Roadmap is the record around a roadmap document. Content is the document
// itself in the builder's JSON format ({title, subtitle, topics, changelog}).
type Roadmap struct {
	ID          string          `json:"id"`
	Slug        string          `json:"slug"`
	Title       string          `json:"title"`
	Subtitle    string          `json:"subtitle"`
	Tags        []string        `json:"tags"`
	OwnerID     string          `json:"ownerId"`
	OwnerName   string          `json:"ownerName,omitempty"`
	Status      Status          `json:"status"`
	ReviewNote  string          `json:"reviewNote,omitempty"`
	Revision    int             `json:"revision"`
	NodeCount   int             `json:"nodeCount"`
	Content     json.RawMessage `json:"content,omitempty"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
	PublishedAt *time.Time      `json:"publishedAt,omitempty"`
}

// Summary strips the content for list views.
func (r Roadmap) Summary() Roadmap {
	r.Content = nil
	return r
}

type Revision struct {
	RoadmapID string          `json:"roadmapId"`
	N         int             `json:"n"`
	Note      string          `json:"note"`
	AuthorID  string          `json:"authorId"`
	Content   json.RawMessage `json:"content,omitempty"`
	CreatedAt time.Time       `json:"createdAt"`
}

// Progress is a learner's per-node status on one roadmap: "" | "prog" | "done".
type Progress map[string]string

type Settings struct {
	SiteName      string `json:"siteName"`
	Tagline       string `json:"tagline"`
	OpenSignup    bool   `json:"openSignup"`
	RequireReview bool   `json:"requireReview"`
}

func DefaultSettings() Settings {
	return Settings{
		SiteName:      "Waymark",
		Tagline:       "Community-built learning roadmaps",
		OpenSignup:    true,
		RequireReview: true,
	}
}
