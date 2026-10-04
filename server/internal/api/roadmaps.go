package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/openroadmap/openroadmap/internal/auth"
	"github.com/openroadmap/openroadmap/internal/content"
	"github.com/openroadmap/openroadmap/internal/model"
	"github.com/openroadmap/openroadmap/internal/store"
)

const maxDocBytes = 8 << 20 // a document with inline base64 screenshots can be big on import

func (s *Server) canEdit(u *model.User, r *model.Roadmap) bool {
	return u != nil && (u.Role == model.RoleAdmin || r.OwnerID == u.ID)
}

func (s *Server) canView(u *model.User, r *model.Roadmap) bool {
	return r.Status == model.StatusPublished || s.canEdit(u, r)
}

func (s *Server) withOwnerName(r *model.Roadmap) {
	if o, err := s.store.UserByID(r.OwnerID); err == nil {
		r.OwnerName = o.Name
	}
}

// GET /api/roadmaps?q=&tag=
func (s *Server) listRoadmaps(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListRoadmaps(store.RoadmapFilter{
		Status: model.StatusPublished,
		Query:  r.URL.Query().Get("q"),
		Tag:    r.URL.Query().Get("tag"),
	})
	if err != nil {
		storeErr(w, err)
		return
	}
	for _, x := range list {
		s.withOwnerName(x)
	}
	if list == nil {
		list = []*model.Roadmap{}
	}
	writeJSON(w, http.StatusOK, list)
}

// GET /api/me/roadmaps
func (s *Server) myRoadmaps(w http.ResponseWriter, r *http.Request, u *model.User) {
	list, err := s.store.ListRoadmaps(store.RoadmapFilter{OwnerID: u.ID})
	if err != nil {
		storeErr(w, err)
		return
	}
	if list == nil {
		list = []*model.Roadmap{}
	}
	writeJSON(w, http.StatusOK, list)
}

// GET /api/roadmaps/{slug}
func (s *Server) getRoadmapBySlug(w http.ResponseWriter, r *http.Request) {
	rm, err := s.store.RoadmapBySlug(r.PathValue("slug"))
	if err != nil {
		storeErr(w, err)
		return
	}
	if !s.canView(s.currentUser(r), rm) {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	s.withOwnerName(rm)
	writeJSON(w, http.StatusOK, rm)
}

// GET /api/roadmaps/id/{id}
func (s *Server) getRoadmapByID(w http.ResponseWriter, r *http.Request, u *model.User) {
	rm, err := s.store.RoadmapByID(r.PathValue("id"))
	if err != nil {
		storeErr(w, err)
		return
	}
	if !s.canView(u, rm) {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	s.withOwnerName(rm)
	writeJSON(w, http.StatusOK, rm)
}

func (s *Server) uniqueSlug(base, selfID string) string {
	slug := base
	for i := 2; ; i++ {
		ex, err := s.store.RoadmapBySlug(slug)
		if err != nil || ex.ID == selfID {
			return slug
		}
		slug = fmt.Sprintf("%s-%d", base, i)
	}
}

// POST /api/roadmaps {title, subtitle, tags}
func (s *Server) createRoadmap(w http.ResponseWriter, r *http.Request, u *model.User) {
	var in struct {
		Title    string   `json:"title"`
		Subtitle string   `json:"subtitle"`
		Tags     []string `json:"tags"`
	}
	if err := readJSON(r, &in, 1<<16); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" {
		writeErr(w, http.StatusBadRequest, "title required")
		return
	}
	doc := content.Document{Title: in.Title, Subtitle: in.Subtitle, Topics: []*content.Node{}}
	raw, _ := json.Marshal(doc)
	now := time.Now()
	rm := &model.Roadmap{
		ID:        auth.ID(),
		Slug:      s.uniqueSlug(content.Slugify(in.Title), ""),
		Title:     in.Title,
		Subtitle:  strings.TrimSpace(in.Subtitle),
		Tags:      cleanTags(in.Tags),
		OwnerID:   u.ID,
		Status:    model.StatusDraft,
		Content:   raw,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.store.CreateRoadmap(rm); err != nil {
		storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, rm)
}

// POST /api/roadmaps/import  (body: a builder JSON document; inline images are stored)
func (s *Server) importRoadmap(w http.ResponseWriter, r *http.Request, u *model.User) {
	body := http.MaxBytesReader(w, r.Body, maxDocBytes)
	var raw json.RawMessage
	if err := json.NewDecoder(body).Decode(&raw); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json: "+err.Error())
		return
	}
	doc, err := content.Parse(raw)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if doc.Title == "" {
		doc.Title = "Imported roadmap"
	}
	n, err := content.Normalize(doc, s.imageSink())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	out, _ := json.Marshal(doc)
	now := time.Now()
	rm := &model.Roadmap{
		ID:        auth.ID(),
		Slug:      s.uniqueSlug(content.Slugify(doc.Title), ""),
		Title:     doc.Title,
		Subtitle:  doc.Subtitle,
		Tags:      []string{},
		OwnerID:   u.ID,
		Status:    model.StatusDraft,
		NodeCount: n,
		Content:   out,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.store.CreateRoadmap(rm); err != nil {
		storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, rm)
}

func (s *Server) imageSink() content.ImageSink {
	return func(dataURI string) (string, error) {
		name, err := s.images.PutDataURI(dataURI)
		if err != nil {
			return "", err
		}
		return "/img/" + name, nil
	}
}

// PUT /api/roadmaps/id/{id} {title?, subtitle?, tags?, content?, note?}
func (s *Server) updateRoadmap(w http.ResponseWriter, r *http.Request, u *model.User) {
	rm, err := s.store.RoadmapByID(r.PathValue("id"))
	if err != nil {
		storeErr(w, err)
		return
	}
	if !s.canEdit(u, rm) {
		writeErr(w, http.StatusForbidden, "not your roadmap")
		return
	}
	var in struct {
		Title    *string          `json:"title"`
		Subtitle *string          `json:"subtitle"`
		Tags     *[]string        `json:"tags"`
		Content  *json.RawMessage `json:"content"`
		Slug     *string          `json:"slug"`
		Note     string           `json:"note"`
		Autosave bool             `json:"autosave"` // autosaves update content without recording a revision
	}
	if err := readJSON(r, &in, maxDocBytes); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json: "+err.Error())
		return
	}
	if in.Content != nil {
		doc, err := content.Parse(*in.Content)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		n, err := content.Normalize(doc, s.imageSink())
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		if in.Title == nil {
			in.Title = &doc.Title
		} else {
			doc.Title = *in.Title
		}
		if in.Subtitle == nil {
			in.Subtitle = &doc.Subtitle
		} else {
			doc.Subtitle = *in.Subtitle
		}
		out, _ := json.Marshal(doc)
		rm.Content = out
		rm.NodeCount = n
	}
	if in.Title != nil && strings.TrimSpace(*in.Title) != "" {
		rm.Title = strings.TrimSpace(*in.Title)
	}
	if in.Subtitle != nil {
		rm.Subtitle = strings.TrimSpace(*in.Subtitle)
	}
	if in.Tags != nil {
		rm.Tags = cleanTags(*in.Tags)
	}
	if in.Slug != nil && rm.Status != model.StatusPublished {
		rm.Slug = s.uniqueSlug(content.Slugify(*in.Slug), rm.ID)
	}
	// Editing a published roadmap keeps it published; readers see the new
	// content immediately. Reviewers can still unpublish. Editing something
	// in review sends it back to draft so the reviewer sees a stable copy.
	if rm.Status == model.StatusReview && in.Content != nil {
		rm.Status = model.StatusDraft
	}
	rm.UpdatedAt = time.Now()
	if err := s.store.UpdateRoadmap(rm); err != nil {
		storeErr(w, err)
		return
	}
	if in.Content != nil && !in.Autosave {
		rm.Revision++
		_ = s.store.AddRevision(&model.Revision{RoadmapID: rm.ID, N: rm.Revision, Note: in.Note, AuthorID: u.ID, Content: rm.Content, CreatedAt: rm.UpdatedAt})
		_ = s.store.UpdateRoadmap(rm)
	}
	writeJSON(w, http.StatusOK, rm)
}

func (s *Server) deleteRoadmap(w http.ResponseWriter, r *http.Request, u *model.User) {
	rm, err := s.store.RoadmapByID(r.PathValue("id"))
	if err != nil {
		storeErr(w, err)
		return
	}
	if !s.canEdit(u, rm) {
		writeErr(w, http.StatusForbidden, "not your roadmap")
		return
	}
	if err := s.store.DeleteRoadmap(rm.ID); err != nil {
		storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) transition(w http.ResponseWriter, r *http.Request, u *model.User, fn func(rm *model.Roadmap, settings model.Settings) error) {
	rm, err := s.store.RoadmapByID(r.PathValue("id"))
	if err != nil {
		storeErr(w, err)
		return
	}
	settings, _ := s.store.Settings()
	if err := fn(rm, settings); err != nil {
		writeErr(w, http.StatusForbidden, err.Error())
		return
	}
	rm.UpdatedAt = time.Now()
	if err := s.store.UpdateRoadmap(rm); err != nil {
		storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, rm)
}

func (s *Server) submitRoadmap(w http.ResponseWriter, r *http.Request, u *model.User) {
	s.transition(w, r, u, func(rm *model.Roadmap, st model.Settings) error {
		if !s.canEdit(u, rm) {
			return errors.New("not your roadmap")
		}
		if rm.NodeCount == 0 {
			return errors.New("add at least one topic before submitting")
		}
		if !st.RequireReview || u.Role == model.RoleAdmin {
			rm.Status = model.StatusPublished
			now := time.Now()
			rm.PublishedAt = &now
		} else {
			rm.Status = model.StatusReview
		}
		rm.ReviewNote = ""
		return nil
	})
}

func (s *Server) publishRoadmap(w http.ResponseWriter, r *http.Request, u *model.User) {
	s.transition(w, r, u, func(rm *model.Roadmap, st model.Settings) error {
		if u.Role != model.RoleAdmin && !(rm.OwnerID == u.ID && !st.RequireReview) {
			return errors.New("only an admin can publish on this instance")
		}
		rm.Status = model.StatusPublished
		now := time.Now()
		rm.PublishedAt = &now
		rm.ReviewNote = ""
		return nil
	})
}

func (s *Server) unpublishRoadmap(w http.ResponseWriter, r *http.Request, u *model.User) {
	s.transition(w, r, u, func(rm *model.Roadmap, st model.Settings) error {
		if !s.canEdit(u, rm) {
			return errors.New("not your roadmap")
		}
		rm.Status = model.StatusDraft
		return nil
	})
}

func (s *Server) rejectRoadmap(w http.ResponseWriter, r *http.Request, u *model.User) {
	var in struct {
		Note string `json:"note"`
	}
	_ = readJSON(r, &in, 1<<16)
	s.transition(w, r, u, func(rm *model.Roadmap, st model.Settings) error {
		if u.Role != model.RoleAdmin {
			return errors.New("admin only")
		}
		rm.Status = model.StatusDraft
		rm.ReviewNote = strings.TrimSpace(in.Note)
		return nil
	})
}

func (s *Server) listRevisions(w http.ResponseWriter, r *http.Request, u *model.User) {
	rm, err := s.store.RoadmapByID(r.PathValue("id"))
	if err != nil {
		storeErr(w, err)
		return
	}
	if !s.canEdit(u, rm) {
		writeErr(w, http.StatusForbidden, "not your roadmap")
		return
	}
	revs, err := s.store.ListRevisions(rm.ID)
	if err != nil {
		storeErr(w, err)
		return
	}
	if revs == nil {
		revs = []*model.Revision{}
	}
	writeJSON(w, http.StatusOK, revs)
}

func (s *Server) getRevision(w http.ResponseWriter, r *http.Request, u *model.User) {
	rm, err := s.store.RoadmapByID(r.PathValue("id"))
	if err != nil {
		storeErr(w, err)
		return
	}
	if !s.canEdit(u, rm) {
		writeErr(w, http.StatusForbidden, "not your roadmap")
		return
	}
	n, _ := strconv.Atoi(r.PathValue("n"))
	rev, err := s.store.Revision(rm.ID, n)
	if err != nil {
		storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, rev)
}

// GET /api/roadmaps/{slug}/export?inline=1
// Returns the document in the original builder format. With inline=1 the
// stored screenshots are embedded as data URIs so the file round-trips into
// the single-file builder (and its Confluence/SharePoint HTML export).
func (s *Server) exportRoadmap(w http.ResponseWriter, r *http.Request) {
	rm, err := s.store.RoadmapBySlug(r.PathValue("slug"))
	if err != nil {
		storeErr(w, err)
		return
	}
	if !s.canView(s.currentUser(r), rm) {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	doc, err := content.Parse(rm.Content)
	if err != nil {
		storeErr(w, err)
		return
	}
	doc.Title, doc.Subtitle = rm.Title, rm.Subtitle
	if doc.Updated == "" {
		doc.Updated = rm.UpdatedAt.Format("2006-01-02")
	}
	if r.URL.Query().Get("inline") == "1" {
		content.Rewrite(doc, func(src string) string {
			if !strings.HasPrefix(src, "/img/") {
				return src
			}
			b, ct, err := s.images.Read(strings.TrimPrefix(src, "/img/"))
			if err != nil {
				return src
			}
			return "data:" + ct + ";base64," + base64.StdEncoding.EncodeToString(b)
		})
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.roadmap.json"`, rm.Slug))
	writeJSON(w, http.StatusOK, doc)
}

// ---- progress ----

func (s *Server) getProgress(w http.ResponseWriter, r *http.Request, u *model.User) {
	p, err := s.store.Progress(u.ID, r.PathValue("id"))
	if err != nil {
		storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) setProgress(w http.ResponseWriter, r *http.Request, u *model.User) {
	rm, err := s.store.RoadmapByID(r.PathValue("id"))
	if err != nil {
		storeErr(w, err)
		return
	}
	if !s.canView(u, rm) {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	var p model.Progress
	if err := readJSON(r, &p, 1<<20); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	for k, v := range p {
		if v != "done" && v != "prog" {
			delete(p, k)
		}
	}
	if err := s.store.SetProgress(u.ID, rm.ID, p); err != nil {
		storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// ---- images ----

func (s *Server) uploadImage(w http.ResponseWriter, r *http.Request, u *model.User) {
	r.Body = http.MaxBytesReader(w, r.Body, 6<<20)
	if err := r.ParseMultipartForm(6 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "upload too large or malformed")
		return
	}
	f, _, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "missing 'file' field")
		return
	}
	defer f.Close()
	name, err := s.images.Put(f)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"url": "/img/" + name})
}

func (s *Server) getImage(w http.ResponseWriter, r *http.Request) {
	f, err := s.images.Open(r.PathValue("name"))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	st, _ := f.Stat()
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeContent(w, r, st.Name(), st.ModTime(), f)
}

// ---- admin ----

func (s *Server) reviewQueue(w http.ResponseWriter, r *http.Request, u *model.User) {
	list, err := s.store.ListRoadmaps(store.RoadmapFilter{Status: model.StatusReview})
	if err != nil {
		storeErr(w, err)
		return
	}
	for _, x := range list {
		s.withOwnerName(x)
	}
	if list == nil {
		list = []*model.Roadmap{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request, u *model.User) {
	list, err := s.store.ListUsers()
	if err != nil {
		storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) setUserRole(w http.ResponseWriter, r *http.Request, u *model.User) {
	var in struct {
		Role model.Role `json:"role"`
	}
	if err := readJSON(r, &in, 1<<10); err != nil || (in.Role != model.RoleAdmin && in.Role != model.RoleMember) {
		writeErr(w, http.StatusBadRequest, "role must be admin or member")
		return
	}
	target, err := s.store.UserByID(r.PathValue("id"))
	if err != nil {
		storeErr(w, err)
		return
	}
	if target.ID == u.ID && in.Role != model.RoleAdmin {
		writeErr(w, http.StatusBadRequest, "you cannot demote yourself")
		return
	}
	target.Role = in.Role
	if err := s.store.UpdateUser(target); err != nil {
		storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, target)
}

func (s *Server) getPublicSettings(w http.ResponseWriter, r *http.Request) {
	st, _ := s.store.Settings()
	n, _ := s.store.CountUsers()
	writeJSON(w, http.StatusOK, map[string]any{
		"siteName":      st.SiteName,
		"tagline":       st.Tagline,
		"openSignup":    st.OpenSignup || n == 0,
		"requireReview": st.RequireReview,
		"needsSetup":    n == 0,
	})
}

func (s *Server) getSettings(w http.ResponseWriter, r *http.Request, u *model.User) {
	st, _ := s.store.Settings()
	writeJSON(w, http.StatusOK, st)
}

func (s *Server) putSettings(w http.ResponseWriter, r *http.Request, u *model.User) {
	var st model.Settings
	if err := readJSON(r, &st, 1<<16); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	st.SiteName = strings.TrimSpace(st.SiteName)
	if st.SiteName == "" {
		st.SiteName = model.DefaultSettings().SiteName
	}
	if err := s.store.SaveSettings(st); err != nil {
		storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func cleanTags(in []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, t := range in {
		t = strings.ToLower(strings.TrimSpace(t))
		if t == "" || seen[t] || len(out) >= 10 {
			continue
		}
		seen[t] = true
		out = append(out, t)
	}
	return out
}
