// Package pagination: port bagian "Pagination artikel" di scraper/src/infrastructure/browser/scripts/extract-article.js.
package pagination

import (
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/adehikmatfr/news-scrap/go-scraper/internal/domain"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/extract/dom"
	"github.com/andybalholm/cascadia"
	"golang.org/x/net/html"
)

var (
	showAllText = regexp.MustCompile(`(?i)^(show all|tampilkan semua|lihat semua|semua halaman|baca semua)$`)
	links       = cascadia.MustCompile("a[href]")
)

// Find hanya menerima link ke path artikel ini sendiri (?page=N, ?p=N, /N, ?page=all, /all),
// supaya pagination halaman indeks atau galeri tidak ikut terambil.
func Find(doc *html.Node, here *url.URL) domain.Pagination {
	basePath := strings.TrimSuffix(here.EscapedPath(), "/")
	current := *here
	current.Fragment = ""
	var all string
	numbered := map[int]string{}

	for _, a := range dom.QueryAll(doc, links) {
		u, err := here.Parse(strings.TrimSpace(dom.Attr(a, "href")))
		if err != nil {
			continue
		}
		u.Fragment = ""
		page, isAll := pageOf(u, here, basePath)
		switch {
		case isAll || (showAllText.MatchString(dom.InnerText(a)) && strings.HasPrefix(u.EscapedPath(), basePath)):
			if all == "" && u.String() != current.String() {
				all = u.String()
			}
		case page >= 2:
			numbered[page] = u.String()
		}
	}

	keys := make([]int, 0, len(numbered))
	for k := range numbered {
		keys = append(keys, k)
	}
	sort.Ints(keys)
	pages := make([]string, 0, len(keys))
	for _, k := range keys {
		pages = append(pages, numbered[k])
	}
	return domain.Pagination{All: all, Pages: pages}
}

// pageOf mengembalikan nomor halaman (0 jika bukan link halaman) dan apakah link menuju versi "semua".
func pageOf(u, here *url.URL, basePath string) (int, bool) {
	if u.Scheme != here.Scheme || u.Host != here.Host {
		return 0, false
	}
	p := strings.TrimSuffix(u.EscapedPath(), "/")
	var n string
	if p == basePath {
		q := u.Query()
		if q.Has("page") {
			n = q.Get("page")
		} else {
			n = q.Get("p")
		}
	} else if strings.HasPrefix(p, basePath+"/") {
		n = p[len(basePath)+1:]
	}
	if n == "all" {
		return 0, true
	}
	if !isDigits(n) {
		return 0, false
	}
	page, err := strconv.Atoi(n)
	if err != nil {
		return 0, false
	}
	return page, false
}

func isDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return s != ""
}
