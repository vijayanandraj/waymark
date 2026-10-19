// Package images is a content-addressed blob store for screenshots. Files are
// named by the SHA-256 of their bytes so re-uploads dedupe for free and URLs
// are safe to cache forever.
package images

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const MaxBytes = 5 << 20 // 5 MB per image

var ErrTooLarge = errors.New("image larger than 5 MB")
var ErrNotImage = errors.New("not a supported image (png, jpeg, gif, webp)")

var extFor = map[string]string{
	"image/png":  "png",
	"image/jpeg": "jpg",
	"image/gif":  "gif",
	"image/webp": "webp",
}

type Store struct{ dir string }

func New(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &Store{dir: dir}, nil
}

// Put stores the bytes and returns the file name ("<sha256>.<ext>").
func (s *Store) Put(r io.Reader) (string, error) {
	b, err := io.ReadAll(io.LimitReader(r, MaxBytes+1))
	if err != nil {
		return "", err
	}
	if len(b) > MaxBytes {
		return "", ErrTooLarge
	}
	ct := http.DetectContentType(b)
	ext, ok := extFor[ct]
	if !ok {
		return "", ErrNotImage
	}
	sum := sha256.Sum256(b)
	name := hex.EncodeToString(sum[:]) + "." + ext
	path := filepath.Join(s.dir, name)
	if _, err := os.Stat(path); err == nil {
		return name, nil
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return "", err
	}
	return name, os.Rename(tmp, path)
}

var safeName = regexp.MustCompile(`^[a-f0-9]{64}\.(png|jpg|gif|webp)$`)

// Open returns the file for a stored name, refusing anything not produced by Put.
func (s *Store) Open(name string) (*os.File, error) {
	if !safeName.MatchString(name) {
		return nil, os.ErrNotExist
	}
	return os.Open(filepath.Join(s.dir, name))
}

// Read returns the bytes of a stored image (used for inline export).
func (s *Store) Read(name string) ([]byte, string, error) {
	f, err := s.Open(name)
	if err != nil {
		return nil, "", err
	}
	defer f.Close()
	b, err := io.ReadAll(f)
	if err != nil {
		return nil, "", err
	}
	return b, http.DetectContentType(b), nil
}

// PutDataURI decodes a data: URI (as produced by the original single-file
// builder) and stores it.
func (s *Store) PutDataURI(uri string) (string, error) {
	i := strings.Index(uri, ",")
	if !strings.HasPrefix(uri, "data:") || i < 0 {
		return "", fmt.Errorf("bad data uri")
	}
	meta, payload := uri[5:i], uri[i+1:]
	var raw []byte
	var err error
	if strings.HasSuffix(meta, ";base64") {
		raw, err = base64.StdEncoding.DecodeString(payload)
		if err != nil {
			return "", err
		}
	} else {
		raw = []byte(payload)
	}
	return s.Put(bytes.NewReader(raw))
}
