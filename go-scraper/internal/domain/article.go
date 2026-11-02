// Package domain berisi aturan inti artikel; tidak bergantung pada HTTP, HTML, atau file.
// Padanan scraper/src/domain/article.js.
package domain

import "strings"

// Image dan Article mengikuti bentuk `article` di payload scraper Bun (scraper/README.md: Kontrak untuk sistem penerima).
type Image struct {
	URL     string  `json:"url"`
	Caption *string `json:"caption"`
}

type Article struct {
	URL            string   `json:"url"`
	Title          string   `json:"title"`
	Description    string   `json:"description"`
	Authors        []string `json:"authors"`
	PublishedAt    *string  `json:"published_at"`
	UpdatedAt      *string  `json:"updated_at"`
	Section        string   `json:"section"`
	Tags           []string `json:"tags"`
	MainImage      string   `json:"main_image"`
	Images         []Image  `json:"images"`
	ContentText    string   `json:"content_text"`
	WordCount      int      `json:"word_count"`
	PageCount      int      `json:"page_count"`
	PaginationMode string   `json:"pagination_mode"`
}

// Pagination: link versi "tampilkan semua" dan halaman 2, 3, ... dari satu halaman artikel.
type Pagination struct {
	All   string
	Pages []string
}

// Page adalah hasil membaca satu halaman: isinya saja, belum digabung dengan halaman lain.
type Page struct {
	Article
	Pagination Pagination
}

// PageOptions mengikuti `maxPages` dan `preferAllPage` per sumber (scraper/src/domain/source.js).
type PageOptions struct {
	MaxPages      int
	PreferAllPage bool
}

var DefaultPageOptions = PageOptions{MaxPages: 10, PreferAllPage: true}

func CountWords(text string) int {
	return len(strings.Fields(text))
}

// MergePages menggabungkan halaman satu artikel: isi disambung, gambar duplikat dibuang, metadata dari halaman pertama.
func MergePages(pages []Article) Article {
	merged := pages[0]
	texts := make([]string, len(pages))
	seen := map[string]bool{}
	images := []Image{}
	for i, p := range pages {
		texts[i] = p.ContentText
		for _, img := range p.Images {
			if !seen[img.URL] {
				seen[img.URL] = true
				images = append(images, img)
			}
		}
	}
	merged.ContentText = strings.Join(texts, "\n\n")
	merged.WordCount = CountWords(merged.ContentText)
	merged.Images = images
	return merged
}
