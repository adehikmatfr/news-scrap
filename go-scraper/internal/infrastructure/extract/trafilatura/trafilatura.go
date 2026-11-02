// Package trafilatura: go-trafilatura memilih wadah isi artikel; selebihnya mengikuti ekstraktor rules,
// seperti sistem produksi Go yang sudah menangani metadata, gambar, dan sampah sendiri (ADR-0005).
// go-trafilatura menulis ulang DOM (link dibuang, <strong> dipecah), jadi teksnya hanya dipakai untuk menemukan
// elemen yang sama di DOM asli; teks isi lalu dibaca dari elemen itu dengan cara rules.
package trafilatura

import (
	"net/url"
	"strings"

	"github.com/adehikmatfr/news-scrap/go-scraper/internal/domain"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/extract/dom"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/extract/rules"
	"github.com/markusmobius/go-trafilatura"
	"golang.org/x/net/html"
)

type Extractor struct {
	Focus    trafilatura.ExtractionFocus
	Fallback bool
}

// Extract mengembalikan `ContentText` kosong jika trafilatura tidak menemukan isi, sama dengan ekstraktor rules.
func (e Extractor) Extract(doc *html.Node, here *url.URL) domain.Page {
	// Metadata, gambar, dan pagination dibaca sebelum DOM diubah.
	p := rules.Extractor{}.Extract(doc, here)
	p.ContentText, p.WordCount = "", 0

	// Teks dibaca dari salinan sebelum PruneNoise, karena rules tidak membuang elemen inline di dalam <p>.
	original := dom.Clone(doc)
	rules.PruneNoise(doc)
	res, err := trafilatura.ExtractDocument(doc, trafilatura.Options{
		OriginalURL:     here,
		EnableFallback:  e.Fallback,
		Focus:           e.Focus,
		ExcludeComments: true,
		Deduplicate:     true,
		HtmlDateMode:    trafilatura.Disabled,
	})
	if err != nil || res.ContentNode == nil {
		return p
	}
	target := wordSet(textWithoutTitle(res.ContentNode))
	container := matchContainer(original, target)
	if container == nil {
		return p
	}
	// Seperti rules: wadah dari daftar selector umum dipakai jika memuat sebagian besar isi yang ditemukan.
	for _, known := range rules.KnownContainers(container) {
		if coverage(known, target) >= minKnownCoverage {
			container = known
			break
		}
	}
	paragraphs := rules.Paragraphs(container)
	p.ContentText = strings.Join(paragraphs, "\n\n")
	p.WordCount = domain.CountWords(p.ContentText)
	return p
}

var containerTags = map[string]bool{"div": true, "article": true, "section": true, "main": true, "td": true, "body": true}

// minCoverage: wadah dianggap memuat isi hasil trafilatura jika memuat sebagian besar katanya;
// sisanya biasanya judul atau label yang trafilatura ambil dari luar wadah isi.
// minKnownCoverage lebih longgar untuk wadah dari daftar selector umum, yang sudah dikenal sebagai wadah isi.
const (
	minCoverage      = 0.9
	minKnownCoverage = 0.8
)

func coverage(n *html.Node, target map[string]bool) float64 {
	hit := 0
	for w := range wordSet(dom.TextContent(n)) {
		if target[w] {
			hit++
		}
	}
	return float64(hit) / float64(len(target))
}

// matchContainer memilih elemen DOM asli terkecil yang memuat ≥ minCoverage kata hasil trafilatura.
// Jika tidak ada, dipakai elemen dengan F1 kata tertinggi.
func matchContainer(doc *html.Node, target map[string]bool) *html.Node {
	if len(target) == 0 {
		return nil
	}
	var smallest, bestF1Node *html.Node
	smallestSize, bestF1 := 0, 0.0
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type != html.ElementNode {
				continue
			}
			if containerTags[c.Data] {
				own := wordSet(dom.TextContent(c))
				hit := 0
				for w := range own {
					if target[w] {
						hit++
					}
				}
				if hit > 0 {
					precision, recall := float64(hit)/float64(len(own)), float64(hit)/float64(len(target))
					if recall >= minCoverage && (smallest == nil || len(own) < smallestSize) {
						smallest, smallestSize = c, len(own)
					}
					if f1 := 2 * precision * recall / (precision + recall); f1 > bestF1 {
						bestF1Node, bestF1 = c, f1
					}
				}
			}
			walk(c)
		}
	}
	walk(doc)
	if smallest != nil {
		return smallest
	}
	return bestF1Node
}

// textWithoutTitle: teks hasil trafilatura tanpa <h1>. Judul sering ada di luar wadah isi, dan di halaman lanjutan
// yang pendek kata-katanya cukup banyak untuk membuat wadah yang lebih lebar terpilih.
func textWithoutTitle(root *html.Node) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			switch {
			case c.Type == html.TextNode:
				b.WriteString(c.Data)
				b.WriteByte(' ')
			case c.Type == html.ElementNode && c.Data == "h1":
			default:
				walk(c)
			}
		}
	}
	walk(root)
	return b.String()
}

func wordSet(text string) map[string]bool {
	set := map[string]bool{}
	for _, w := range strings.Fields(strings.ToLower(text)) {
		set[w] = true
	}
	return set
}
