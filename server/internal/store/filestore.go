package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/openroadmap/openroadmap/internal/model"
)

// FileStore keeps everything in memory and mirrors each record to a JSON file
// under dir. Writes are atomic (temp file + rename). It is meant for a single
// server process, which is the self-hosting shape this project targets.
//
// Layout:
//
//	<dir>/users/<id>.json
//	<dir>/sessions.json
//	<dir>/roadmaps/<id>.json
//	<dir>/revisions/<roadmapId>/<n>.json
//	<dir>/progress/<userId>/<roadmapId>.json
//	<dir>/settings.json
type FileStore struct {
	dir string
	mu  sync.RWMutex

	users    map[string]*model.User
	sessions map[string]*model.Session
	roadmaps map[string]*model.Roadmap
	settings model.Settings
}

func OpenFileStore(dir string) (*FileStore, error) {
	fs := &FileStore{
		dir:      dir,
		users:    map[string]*model.User{},
		sessions: map[string]*model.Session{},
		roadmaps: map[string]*model.Roadmap{},
		settings: model.DefaultSettings(),
	}
	for _, d := range []string{"users", "roadmaps", "revisions", "progress", "images"} {
		if err := os.MkdirAll(filepath.Join(dir, d), 0o755); err != nil {
			return nil, err
		}
	}
	if err := fs.load(); err != nil {
		return nil, err
	}
	return fs, nil
}

func (fs *FileStore) load() error {
	// users
	entries, _ := os.ReadDir(filepath.Join(fs.dir, "users"))
	for _, e := range entries {
		var u struct {
			model.User
			PasswordHash string `json:"passwordHash"`
		}
		if err := readJSON(filepath.Join(fs.dir, "users", e.Name()), &u); err != nil {
			return fmt.Errorf("user %s: %w", e.Name(), err)
		}
		u.User.PasswordHash = u.PasswordHash
		uu := u.User
		fs.users[uu.ID] = &uu
	}
	// sessions
	var sess []*model.Session
	_ = readJSON(filepath.Join(fs.dir, "sessions.json"), &sess)
	now := time.Now()
	for _, s := range sess {
		if s.ExpiresAt.After(now) {
			fs.sessions[s.Token] = s
		}
	}
	// roadmaps
	entries, _ = os.ReadDir(filepath.Join(fs.dir, "roadmaps"))
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		var r model.Roadmap
		if err := readJSON(filepath.Join(fs.dir, "roadmaps", e.Name()), &r); err != nil {
			return fmt.Errorf("roadmap %s: %w", e.Name(), err)
		}
		fs.roadmaps[r.ID] = &r
	}
	// settings
	var s model.Settings
	if err := readJSON(filepath.Join(fs.dir, "settings.json"), &s); err == nil {
		fs.settings = s
	}
	return nil
}

func readJSON(path string, v any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

func writeJSON(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// ---- users ----

type userOnDisk struct {
	model.User
	PasswordHash string `json:"passwordHash"`
}

func (fs *FileStore) saveUser(u *model.User) error {
	return writeJSON(filepath.Join(fs.dir, "users", u.ID+".json"), userOnDisk{User: *u, PasswordHash: u.PasswordHash})
}

func (fs *FileStore) CreateUser(u *model.User) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	for _, x := range fs.users {
		if strings.EqualFold(x.Email, u.Email) {
			return ErrConflict
		}
	}
	cp := *u
	fs.users[u.ID] = &cp
	return fs.saveUser(&cp)
}

func (fs *FileStore) UserByID(id string) (*model.User, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	u, ok := fs.users[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *u
	return &cp, nil
}

func (fs *FileStore) UserByEmail(email string) (*model.User, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	for _, u := range fs.users {
		if strings.EqualFold(u.Email, email) {
			cp := *u
			return &cp, nil
		}
	}
	return nil, ErrNotFound
}

func (fs *FileStore) ListUsers() ([]*model.User, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	out := make([]*model.User, 0, len(fs.users))
	for _, u := range fs.users {
		cp := *u
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out, nil
}

func (fs *FileStore) UpdateUser(u *model.User) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	if _, ok := fs.users[u.ID]; !ok {
		return ErrNotFound
	}
	cp := *u
	fs.users[u.ID] = &cp
	return fs.saveUser(&cp)
}

func (fs *FileStore) CountUsers() (int, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	return len(fs.users), nil
}

// ---- sessions ----

func (fs *FileStore) saveSessions() error {
	list := make([]*model.Session, 0, len(fs.sessions))
	for _, s := range fs.sessions {
		list = append(list, s)
	}
	return writeJSON(filepath.Join(fs.dir, "sessions.json"), list)
}

func (fs *FileStore) CreateSession(s *model.Session) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	cp := *s
	fs.sessions[s.Token] = &cp
	return fs.saveSessions()
}

func (fs *FileStore) Session(token string) (*model.Session, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	s, ok := fs.sessions[token]
	if !ok || s.ExpiresAt.Before(time.Now()) {
		return nil, ErrNotFound
	}
	cp := *s
	return &cp, nil
}

func (fs *FileStore) DeleteSession(token string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	delete(fs.sessions, token)
	return fs.saveSessions()
}

// ---- roadmaps ----

func (fs *FileStore) saveRoadmap(r *model.Roadmap) error {
	return writeJSON(filepath.Join(fs.dir, "roadmaps", r.ID+".json"), r)
}

func (fs *FileStore) CreateRoadmap(r *model.Roadmap) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	for _, x := range fs.roadmaps {
		if x.Slug == r.Slug {
			return ErrConflict
		}
	}
	cp := *r
	fs.roadmaps[r.ID] = &cp
	return fs.saveRoadmap(&cp)
}

func (fs *FileStore) RoadmapByID(id string) (*model.Roadmap, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	r, ok := fs.roadmaps[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *r
	return &cp, nil
}

func (fs *FileStore) RoadmapBySlug(slug string) (*model.Roadmap, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	for _, r := range fs.roadmaps {
		if r.Slug == slug {
			cp := *r
			return &cp, nil
		}
	}
	return nil, ErrNotFound
}

func (fs *FileStore) ListRoadmaps(f RoadmapFilter) ([]*model.Roadmap, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	q := strings.ToLower(strings.TrimSpace(f.Query))
	var out []*model.Roadmap
	for _, r := range fs.roadmaps {
		if f.Status != "" && r.Status != f.Status {
			continue
		}
		if f.OwnerID != "" && r.OwnerID != f.OwnerID {
			continue
		}
		if f.Tag != "" && !hasTag(r.Tags, f.Tag) {
			continue
		}
		if q != "" {
			hay := strings.ToLower(r.Title + " " + r.Subtitle + " " + strings.Join(r.Tags, " "))
			if !strings.Contains(hay, q) {
				continue
			}
		}
		cp := r.Summary()
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt.After(out[j].UpdatedAt) })
	return out, nil
}

func hasTag(tags []string, t string) bool {
	for _, x := range tags {
		if strings.EqualFold(x, t) {
			return true
		}
	}
	return false
}

func (fs *FileStore) UpdateRoadmap(r *model.Roadmap) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	if _, ok := fs.roadmaps[r.ID]; !ok {
		return ErrNotFound
	}
	for _, x := range fs.roadmaps {
		if x.ID != r.ID && x.Slug == r.Slug {
			return ErrConflict
		}
	}
	cp := *r
	fs.roadmaps[r.ID] = &cp
	return fs.saveRoadmap(&cp)
}

func (fs *FileStore) DeleteRoadmap(id string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	if _, ok := fs.roadmaps[id]; !ok {
		return ErrNotFound
	}
	delete(fs.roadmaps, id)
	_ = os.RemoveAll(filepath.Join(fs.dir, "revisions", id))
	return os.Remove(filepath.Join(fs.dir, "roadmaps", id+".json"))
}

// ---- revisions ----

func (fs *FileStore) AddRevision(rev *model.Revision) error {
	return writeJSON(filepath.Join(fs.dir, "revisions", rev.RoadmapID, fmt.Sprintf("%06d.json", rev.N)), rev)
}

func (fs *FileStore) ListRevisions(roadmapID string) ([]*model.Revision, error) {
	entries, err := os.ReadDir(filepath.Join(fs.dir, "revisions", roadmapID))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []*model.Revision
	for _, e := range entries {
		var r model.Revision
		if err := readJSON(filepath.Join(fs.dir, "revisions", roadmapID, e.Name()), &r); err != nil {
			continue
		}
		r.Content = nil
		out = append(out, &r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].N > out[j].N })
	return out, nil
}

func (fs *FileStore) Revision(roadmapID string, n int) (*model.Revision, error) {
	var r model.Revision
	if err := readJSON(filepath.Join(fs.dir, "revisions", roadmapID, fmt.Sprintf("%06d.json", n)), &r); err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &r, nil
}

// ---- progress ----

func (fs *FileStore) Progress(userID, roadmapID string) (model.Progress, error) {
	p := model.Progress{}
	err := readJSON(filepath.Join(fs.dir, "progress", userID, roadmapID+".json"), &p)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	return p, nil
}

func (fs *FileStore) SetProgress(userID, roadmapID string, p model.Progress) error {
	return writeJSON(filepath.Join(fs.dir, "progress", userID, roadmapID+".json"), p)
}

// ---- settings ----

func (fs *FileStore) Settings() (model.Settings, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	return fs.settings, nil
}

func (fs *FileStore) SaveSettings(s model.Settings) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	fs.settings = s
	return writeJSON(filepath.Join(fs.dir, "settings.json"), s)
}

func (fs *FileStore) Close() error { return nil }
