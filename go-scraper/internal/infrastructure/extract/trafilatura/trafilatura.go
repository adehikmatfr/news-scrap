// Package trafilatura: ekstraktor memakai go-trafilatura, seperti sistem produksi berbasis Go (ADR-0005).
// Pagination dibaca dengan aturan yang sama dengan ekstraktor rules, supaya perbandingan hanya pada isi dan metadata.
package trafilatura

import (
	"net/url"
	"strings"
	"time"

	"github.com/adehikmatfr/news-scrap/go-scraper/internal/domain"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/extract/dom"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/extract/pagination"
	"github.com/markusmobius/go-htmldate"
	"github.com/markusmobius/go-trafilatura"
	"golang.org/x/net/html"
)

type Extractor struct {
	Focus    trafilatura.ExtractionFocus
	Fallback bool
	// ExtractTime meminta jam terbit dari go-htmldate; default trafilatura hanya mengambil tanggal (00:00 UTC).
	ExtractTime bool
}

// Extract mengembalikan `ContentText` kosong jika trafilatura tidak menemukan isi, sama dengan ekstraktor rules.
func (e Extractor) Extract(doc *html.Node, here *url.URL) domain.Page {
	// Dibaca sebelum trafilatura, yang mengubah pohon DOM saat membersihkan halaman.
	p := domain.Page{Pagination: pagination.Find(doc, here)}
	p.URL = here.String()

	opts := trafilatura.Options{
		OriginalURL:     here,
		EnableFallback:  e.Fallback,
		Focus:           e.Focus,
		ExcludeComments: true,
		IncludeImages:   true,
		Deduplicate:     true,
	}
	if e.ExtractTime {
		// Sama dengan preset bawaan trafilatura, ditambah ExtractTime.
		opts.HtmlDateOptions = &htmldate.Options{UseOriginalDate: true, SkipExtensiveSearch: !e.Fallback, ExtractTime: true}
	}
	res, err := trafilatura.ExtractDocument(doc, opts)
	if err != nil {
		p.Authors, p.Tags, p.Images = []string{}, []string{}, []domain.Image{}
		return p
	}
	paragraphs := blockTexts(res.ContentNode)
	m := res.Metadata
	p.Title = m.Title
	p.Description = m.Description
	p.Authors = splitAuthors(m.Author)
	p.Tags = nonNil(m.Tags)
	p.MainImage = m.Image
	p.Images = images(res.ContentNode, here)
	p.ContentText = strings.Join(paragraphs, "\n\n")
	p.WordCount = domain.CountWords(p.ContentText)
	if len(m.Categories) > 0 {
		p.Section = m.Categories[0]
	}
	if !m.Date.IsZero() {
		s := m.Date.Format(time.RFC3339)
		p.PublishedAt = &s
	}
	return p
}

// trafilatura menggabungkan beberapa penulis dengan "; ".
func splitAuthors(s string) []string {
	out := []string{}
	for _, name := range strings.Split(s, ";") {
		if name = strings.TrimSpace(name); name != "" {
			out = append(out, name)
		}
	}
	return out
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

var blockTags = map[string]bool{
	"p": true, "h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
	"li": true, "blockquote": true, "pre": true, "td": true, "th": true, "div": true,
}

// blockTexts mengambil teks per elemen blok terdalam, supaya paragraf terpisah "\n\n" seperti ekstraktor rules.
func blockTexts(root *html.Node) []string {
	var out []string
	var walk func(n *html.Node) bool
	// walk mengembalikan true jika n berisi elemen blok, sehingga induknya tidak menghasilkan teks ganda.
	walk = func(n *html.Node) bool {
		hasBlock := false
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if walk(c) {
				hasBlock = true
			}
		}
		if n.Type != html.ElementNode || !blockTags[n.Data] {
			return hasBlock
		}
		if !hasBlock {
			if text := dom.Collapse(dom.TextContent(n)); text != "" {
				out = append(out, text)
			}
		}
		return true
	}
	if root != nil {
		walk(root)
	}
	return out
}

func images(root *html.Node, base *url.URL) []domain.Image {
	out := []domain.Image{}
	seen := map[string]bool{}
	var walk func(n *html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "img" {
			if src := dom.Attr(n, "src"); src != "" {
				if u, err := base.Parse(src); err == nil && !seen[u.String()] {
					seen[u.String()] = true
					out = append(out, domain.Image{URL: u.String(), Caption: caption(n)})
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	if root != nil {
		walk(root)
	}
	return out
}

func caption(img *html.Node) *string {
	for _, key := range []string{"title", "alt"} {
		if v := strings.TrimSpace(dom.Attr(img, key)); v != "" {
			return &v
		}
	}
	return nil
}
