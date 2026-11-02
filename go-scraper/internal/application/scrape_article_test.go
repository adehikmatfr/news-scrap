package application

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/adehikmatfr/news-scrap/go-scraper/internal/domain"
)

type fakeReader struct {
	pages map[string]domain.Page
	reads []string
}

func (f *fakeReader) Read(_ context.Context, url string) (domain.Page, error) {
	f.reads = append(f.reads, url)
	p, ok := f.pages[url]
	if !ok {
		return domain.Page{}, errors.New("not found: " + url)
	}
	return p, nil
}

type nopLogger struct{}

func (nopLogger) Warn(string, ...any) {}

func page(text string, pages ...string) domain.Page {
	return domain.Page{
		Article:    domain.Article{Title: "Judul", ContentText: text, WordCount: domain.CountWords(text)},
		Pagination: domain.Pagination{Pages: pages},
	}
}

func run(t *testing.T, r *fakeReader, opts domain.PageOptions) domain.Article {
	t.Helper()
	a, err := (&ScrapeArticle{Reader: r, Logger: nopLogger{}}).Execute(context.Background(), "/a", opts)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func TestFollowsPagesAndCollectsLinksFromEachPage(t *testing.T) {
	r := &fakeReader{pages: map[string]domain.Page{
		"/a":   page("satu", "/a/2"),
		"/a/2": page("dua", "/a/3"),
		"/a/3": page("tiga"),
	}}
	a := run(t, r, domain.DefaultPageOptions)
	if a.ContentText != "satu\n\ndua\n\ntiga" || a.PageCount != 3 || a.PaginationMode != "sequential" {
		t.Fatalf("got %+v", a)
	}
}

func TestStopsOnEmptyOrRepeatedContent(t *testing.T) {
	r := &fakeReader{pages: map[string]domain.Page{
		"/a":   page("satu", "/a/2", "/a/3"),
		"/a/2": page("satu"),
		"/a/3": page("tiga"),
	}}
	if a := run(t, r, domain.DefaultPageOptions); a.PageCount != 1 || len(r.reads) != 2 {
		t.Fatalf("page_count=%d reads=%v", a.PageCount, r.reads)
	}
	r = &fakeReader{pages: map[string]domain.Page{"/a": page("satu", "/a/2"), "/a/2": page("")}}
	if a := run(t, r, domain.DefaultPageOptions); a.PageCount != 1 {
		t.Fatalf("empty page must stop, page_count=%d", a.PageCount)
	}
}

func TestRespectsMaxPages(t *testing.T) {
	r := &fakeReader{pages: map[string]domain.Page{
		"/a":   page("satu", "/a/2", "/a/3"),
		"/a/2": page("dua"),
		"/a/3": page("tiga"),
	}}
	if a := run(t, r, domain.PageOptions{MaxPages: 2}); a.PageCount != 2 || len(r.reads) != 2 {
		t.Fatalf("page_count=%d reads=%v", a.PageCount, r.reads)
	}
}

func TestPrefersLongerAllPage(t *testing.T) {
	first := page("satu", "/a/2")
	first.Pagination.All = "/a/all"
	r := &fakeReader{pages: map[string]domain.Page{"/a": first, "/a/all": page("satu dua tiga")}}
	a := run(t, r, domain.DefaultPageOptions)
	if a.PaginationMode != "all" || a.PageCount != 2 || !strings.Contains(a.ContentText, "tiga") {
		t.Fatalf("got %+v", a)
	}
}

func TestFallsBackToPagesWhenAllPageFailsOrIsShorter(t *testing.T) {
	first := page("satu dua", "/a/2")
	first.Pagination.All = "/a/all"
	r := &fakeReader{pages: map[string]domain.Page{"/a": first, "/a/2": page("tiga")}}
	if a := run(t, r, domain.DefaultPageOptions); a.PaginationMode != "sequential" {
		t.Fatalf("failed all page: got %+v", a)
	}
	r.pages["/a/all"] = page("satu")
	if a := run(t, r, domain.DefaultPageOptions); a.PaginationMode != "sequential" {
		t.Fatalf("shorter all page: got %+v", a)
	}
}

func TestPageFetchErrorFailsArticle(t *testing.T) {
	r := &fakeReader{pages: map[string]domain.Page{"/a": page("satu", "/a/2")}}
	if _, err := (&ScrapeArticle{Reader: r, Logger: nopLogger{}}).Execute(context.Background(), "/a", domain.DefaultPageOptions); err == nil {
		t.Fatal("want error when a following page cannot be fetched")
	}
}
