// Command server runs the Waymark API and serves the built web app.
//
// Configuration is by environment variable (flags override):
//
//	ADDR            listen address            (default ":8080")
//	DATA_DIR        where JSON + images live  (default "./data")
//	SECURE_COOKIES  "1" when behind HTTPS     (default off)
package main

import (
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/openroadmap/openroadmap/internal/api"
	"github.com/openroadmap/openroadmap/internal/images"
	"github.com/openroadmap/openroadmap/internal/store"
	"github.com/openroadmap/openroadmap/webdist"
)

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	addr := flag.String("addr", env("ADDR", ":8080"), "listen address")
	dataDir := flag.String("data", env("DATA_DIR", "./data"), "data directory")
	secure := flag.Bool("secure-cookies", env("SECURE_COOKIES", "") == "1", "mark session cookies Secure (use behind HTTPS)")
	flag.Parse()

	st, err := store.OpenFileStore(*dataDir)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	img, err := images.New(filepath.Join(*dataDir, "images"))
	if err != nil {
		log.Fatalf("image store: %v", err)
	}

	var spa fs.FS
	if sub, err := fs.Sub(webdist.FS, "dist"); err == nil {
		if _, err := fs.Stat(sub, "index.html"); err == nil {
			spa = sub
		} else {
			log.Printf("no built web app embedded (run `npm run build` in web/); serving API only")
		}
	}

	srv := &http.Server{
		Addr:              *addr,
		Handler:           logRequests(api.New(st, img, spa, api.Config{SecureCookies: *secure})),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("waymark listening on %s (data in %s)", *addr, *dataDir)
	log.Fatal(srv.ListenAndServe())
}

func logRequests(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		h.ServeHTTP(w, r)
		if len(r.URL.Path) >= 4 && r.URL.Path[:4] == "/api" {
			log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
		}
	})
}
