package pagereader

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/adehikmatfr/news-scrap/go-scraper/internal/application"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/domain"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/extract/rules"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/httpx"
)

func body(label, links string) string {
	var b strings.Builder
	b.WriteString(`<html><head><title>Judul</title></head><body><div class="article-content">`)
	for i := 1; i <= 3; i++ {
		fmt.Fprintf(&b, "<p>%s paragraf %d berisi kalimat berita, dengan koma, yang cukup panjang supaya dihitung sebagai isi artikel.</p>", label, i)
	}
	b.WriteString(links + `</div></body></html>`)
	return b.String()
}

type nopLogger struct{}

func (nopLogger) Warn(string, ...any) {}

// Alur lengkap tanpa browser: HTTP → ekstraktor rules → ScrapeArticle mengikuti halaman 2 setelah redirect.
func TestScrapesMultiPageArticleOverHTTP(t *testing.T) {
	pages := map[string]string{
		"/read/1":        body("Satu", `<a href="/read/1?page=2">2</a>`),
		"/read/1?page=2": body("Dua", ``),
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/lama" {
			http.Redirect(w, r, "/read/1", http.StatusMovedPermanently)
			return
		}
		html, ok := pages[r.URL.RequestURI()]
		if !ok {
			http.NotFound(w, r)
			return
		}
		fmt.Fprint(w, html)
	}))
	defer srv.Close()

	reader := &HTTPPageReader{Client: httpx.New("test", 5*time.Second), Extractor: rules.Extractor{}}
	scrape := &application.ScrapeArticle{Reader: reader, Logger: nopLogger{}}
	a, err := scrape.Execute(context.Background(), srv.URL+"/lama", domain.DefaultPageOptions)
	if err != nil {
		t.Fatal(err)
	}
	if a.PageCount != 2 || !strings.Contains(a.ContentText, "Dua paragraf 3") || a.URL != srv.URL+"/read/1" {
		t.Fatalf("page_count=%d url=%s content=%q", a.PageCount, a.URL, a.ContentText)
	}
}
