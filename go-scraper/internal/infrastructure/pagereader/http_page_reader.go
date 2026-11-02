// Package pagereader: implementasi port PageReader tanpa browser. Halaman diambil lewat HTTP,
// diurai sebagai HTML, lalu diekstrak; padanan BrowserPageReader di scraper Bun.
package pagereader

import (
	"bytes"
	"context"
	"net/url"

	"github.com/adehikmatfr/news-scrap/go-scraper/internal/domain"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/httpx"
	"golang.org/x/net/html"
)

// Extractor membaca satu halaman yang sudah diurai; `here` adalah URL akhir setelah redirect.
type Extractor interface {
	Extract(doc *html.Node, here *url.URL) domain.Page
}

type HTTPPageReader struct {
	Client    *httpx.Client
	Extractor Extractor
}

func (r *HTTPPageReader) Read(ctx context.Context, rawURL string) (domain.Page, error) {
	resp, err := r.Client.Get(ctx, rawURL)
	if err != nil {
		return domain.Page{}, err
	}
	doc, err := html.Parse(bytes.NewReader(resp.Body))
	if err != nil {
		return domain.Page{}, err
	}
	return r.Extractor.Extract(doc, resp.URL), nil
}
