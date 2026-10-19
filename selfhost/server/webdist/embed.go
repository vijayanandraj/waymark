// Package webdist embeds the built frontend (web/ → npm run build → here).
package webdist

import "embed"

// FS contains dist/**. When dist/ only holds the placeholder, the server
// runs API-only, which is what you want during `npm run dev`.
//
//go:embed all:dist
var FS embed.FS
