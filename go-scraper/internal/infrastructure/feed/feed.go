// Package feed membaca daftar URL artikel dari RSS/Atom memakai gofeed.
package feed

import (
	"bytes"
	"context"

	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/httpx"
	"github.com/mmcdole/gofeed"
)

type Reader struct {
	Client *httpx.Client
}

// Links mengembalikan link item sesuai urutan feed; limit 0 berarti semua.
func (r *Reader) Links(ctx context.Context, feedURL string, limit int) ([]string, error) {
	resp, err := r.Client.Get(ctx, feedURL)
	if err != nil {
		return nil, err
	}
	f, err := gofeed.NewParser().Parse(bytes.NewReader(resp.Body))
	if err != nil {
		return nil, err
	}
	var out []string
	for _, item := range f.Items {
		if limit > 0 && len(out) >= limit {
			break
		}
		out = append(out, item.Link)
	}
	return out, nil
}
