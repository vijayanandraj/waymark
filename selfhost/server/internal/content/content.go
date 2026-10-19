// Package content understands the roadmap document format: the same JSON the
// original single-file builder exports, so existing roadmaps import as-is.
//
//	{
//	  "title": "...", "subtitle": "...", "updated": "2026-09-17",
//	  "changelog": [{"date": "2026-09-17", "text": "..."}],
//	  "topics": [ Node ]
//	}
//	Node: { "id", "label", "type": core|alt|optional, "side": auto|left|right,
//	        "desc": markdown-lite, "links": [{label,url}], "faq": [{q,a}],
//	        "images": [{src,caption}], "children": [ Node ] }
package content

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

const MaxDepth = 4 // levels of subtopics under a milestone
const MaxNodes = 2000

type Link struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

type FAQ struct {
	Q string `json:"q"`
	A string `json:"a"`
}

type Image struct {
	Src     string `json:"src"`
	Caption string `json:"caption,omitempty"`
}

type Node struct {
	ID       string  `json:"id"`
	Label    string  `json:"label"`
	Type     string  `json:"type,omitempty"`
	Side     string  `json:"side,omitempty"`
	Desc     string  `json:"desc,omitempty"`
	Links    []Link  `json:"links"`
	FAQ      []FAQ   `json:"faq,omitempty"`
	Images   []Image `json:"images,omitempty"`
	Children []*Node `json:"children"`
}

type ChangelogEntry struct {
	Date string `json:"date"`
	Text string `json:"text"`
}

type Document struct {
	Title     string           `json:"title"`
	Subtitle  string           `json:"subtitle"`
	Updated   string           `json:"updated,omitempty"`
	Changelog []ChangelogEntry `json:"changelog,omitempty"`
	Topics    []*Node          `json:"topics"`
}

var ErrInvalid = errors.New("invalid roadmap document")

var idRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,40}$`)
var httpRe = regexp.MustCompile(`^(https?:)?//`)

func Parse(raw []byte) (*Document, error) {
	var d Document
	if err := json.Unmarshal(raw, &d); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if d.Topics == nil {
		d.Topics = []*Node{}
	}
	return &d, nil
}

// ImageSink stores a data: URI and returns the URL it should be replaced with.
type ImageSink func(dataURI string) (string, error)

// Normalize validates the tree, fills missing ids, clamps types, strips
// dangerous link schemes and hands inline data-URI images to sink so the
// document only ever references stored images. It returns the node count.
func Normalize(d *Document, sink ImageSink) (int, error) {
	d.Title = strings.TrimSpace(d.Title)
	d.Subtitle = strings.TrimSpace(d.Subtitle)
	if len(d.Title) > 200 || len(d.Subtitle) > 1000 {
		return 0, fmt.Errorf("%w: title or subtitle too long", ErrInvalid)
	}
	seen := map[string]bool{}
	count := 0
	var walk func(n *Node, depth int) error
	walk = func(n *Node, depth int) error {
		count++
		if count > MaxNodes {
			return fmt.Errorf("%w: more than %d nodes", ErrInvalid, MaxNodes)
		}
		if !idRe.MatchString(n.ID) || seen[n.ID] {
			n.ID = NewID()
		}
		seen[n.ID] = true
		n.Label = strings.TrimSpace(n.Label)
		if len(n.Label) > 200 {
			n.Label = n.Label[:200]
		}
		if depth == 0 {
			n.Type, n.Side = "", ""
		} else {
			switch n.Type {
			case "core", "alt", "optional":
			default:
				n.Type = "core"
			}
			if depth == 1 {
				switch n.Side {
				case "left", "right", "auto":
				default:
					n.Side = "auto"
				}
			} else {
				n.Side = ""
			}
		}
		if n.Links == nil {
			n.Links = []Link{}
		}
		kept := n.Links[:0]
		for _, l := range n.Links {
			l.URL = strings.TrimSpace(l.URL)
			l.Label = strings.TrimSpace(l.Label)
			if l.URL == "" && l.Label == "" {
				continue
			}
			if l.URL != "" && !httpRe.MatchString(l.URL) && !strings.HasPrefix(l.URL, "/") && !strings.HasPrefix(l.URL, "#") {
				l.URL = "https://" + l.URL
			}
			kept = append(kept, l)
		}
		n.Links = kept
		for i := range n.Images {
			src := n.Images[i].Src
			switch {
			case strings.HasPrefix(src, "data:"):
				if sink == nil {
					return fmt.Errorf("%w: inline images not accepted here", ErrInvalid)
				}
				u, err := sink(src)
				if err != nil {
					return fmt.Errorf("image on %q: %w", n.Label, err)
				}
				n.Images[i].Src = u
			case strings.HasPrefix(src, "/img/"), httpRe.MatchString(src):
			default:
				return fmt.Errorf("%w: image src must be an uploaded image or an http(s) url", ErrInvalid)
			}
		}
		if n.Children == nil {
			n.Children = []*Node{}
		}
		if len(n.Children) > 0 && depth >= MaxDepth {
			return fmt.Errorf("%w: %q nests deeper than %d levels", ErrInvalid, n.Label, MaxDepth)
		}
		for _, c := range n.Children {
			if err := walk(c, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	for _, t := range d.Topics {
		if err := walk(t, 0); err != nil {
			return 0, err
		}
	}
	return count, nil
}

func NewID() string {
	b := make([]byte, 5)
	_, _ = rand.Read(b)
	return "n" + hex.EncodeToString(b)
}

// ImageNames lists the stored image names a document references.
func ImageNames(d *Document) []string {
	var out []string
	var walk func(n *Node)
	walk = func(n *Node) {
		for _, im := range n.Images {
			if strings.HasPrefix(im.Src, "/img/") {
				out = append(out, strings.TrimPrefix(im.Src, "/img/"))
			}
		}
		for _, c := range n.Children {
			walk(c)
		}
	}
	for _, t := range d.Topics {
		walk(t)
	}
	return out
}

// Rewrite replaces image srcs via fn (used to inline images on export).
func Rewrite(d *Document, fn func(src string) string) {
	var walk func(n *Node)
	walk = func(n *Node) {
		for i := range n.Images {
			n.Images[i].Src = fn(n.Images[i].Src)
		}
		for _, c := range n.Children {
			walk(c)
		}
	}
	for _, t := range d.Topics {
		walk(t)
	}
}

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

func Slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = slugRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 80 {
		s = strings.Trim(s[:80], "-")
	}
	if s == "" {
		s = "roadmap"
	}
	return s
}
