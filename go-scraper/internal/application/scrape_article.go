package application

import (
	"context"

	"github.com/adehikmatfr/news-scrap/go-scraper/internal/domain"
)

// ScrapeArticle mengambil satu artikel lengkap, termasuk artikel multi-halaman. Versi "tampilkan semua"
// diutamakan karena cukup sekali buka; jika tidak ada atau gagal, halaman 2, 3, ... diikuti lalu isi dan
// gambarnya digabung. Alurnya sama dengan scraper/src/application/scrape-article.js.
type ScrapeArticle struct {
	Reader PageReader
	Logger Logger
}

func (s *ScrapeArticle) Execute(ctx context.Context, url string, opts domain.PageOptions) (domain.Article, error) {
	first, err := s.Reader.Read(ctx, url)
	if err != nil {
		return domain.Article{}, err
	}
	pageCount := len(first.Pagination.Pages) + 1

	if opts.PreferAllPage && first.Pagination.All != "" {
		all, err := s.Reader.Read(ctx, first.Pagination.All)
		if err != nil {
			s.Logger.Warn("show-all page failed, following pages instead", "url", first.Pagination.All, "error", err)
		} else if all.WordCount > first.WordCount {
			a := all.Article
			a.PageCount, a.PaginationMode = pageCount, "all"
			return a, nil
		}
	}

	pages, err := s.followPages(ctx, first, url, opts.MaxPages)
	if err != nil {
		return domain.Article{}, err
	}
	a := domain.MergePages(pages)
	a.PageCount = len(pages)
	a.PaginationMode = "single"
	if len(pages) > 1 {
		a.PaginationMode = "sequential"
	}
	return a, nil
}

func (s *ScrapeArticle) followPages(ctx context.Context, first domain.Page, startURL string, maxPages int) ([]domain.Article, error) {
	pages := []domain.Article{first.Article}
	visited := map[string]bool{startURL: true}
	queue := append([]string(nil), first.Pagination.Pages...)

	for len(queue) > 0 && len(visited) < maxPages {
		next := queue[0]
		queue = queue[1:]
		if visited[next] {
			continue
		}
		visited[next] = true

		page, err := s.Reader.Read(ctx, next)
		if err != nil {
			return nil, err
		}
		// Isi kosong atau sama persis berarti situs mengabaikan parameter halaman: berhenti.
		if page.ContentText == "" || sameContent(pages, page.ContentText) {
			break
		}
		pages = append(pages, page.Article)

		// Sebagian situs hanya menampilkan link "berikutnya", jadi kumpulkan link dari tiap halaman.
		for _, u := range page.Pagination.Pages {
			if !visited[u] && !contains(queue, u) {
				queue = append(queue, u)
			}
		}
	}
	return pages, nil
}

func sameContent(pages []domain.Article, text string) bool {
	for _, p := range pages {
		if p.ContentText == text {
			return true
		}
	}
	return false
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}
