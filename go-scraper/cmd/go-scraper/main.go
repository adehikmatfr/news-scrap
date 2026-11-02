// go-scraper: pembanding lintas bahasa untuk scraper Bun (ADR-0005), tanpa browser, tanpa webhook, tanpa state.
// File ini composition root: satu-satunya tempat merakit adapter dan usecase.
//
//	go-scraper feed [-limit 3] <rss-url>       daftar URL artikel dari RSS/Atom, satu per baris
//	go-scraper extract [url...]                satu JSON per URL; tanpa argumen, dibaca per baris dari stdin,
//	                                           berupa URL atau {"url","max_pages","prefer_all_page"}
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/adehikmatfr/news-scrap/go-scraper/internal/application"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/domain"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/extract/rules"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/extract/trafilatura"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/feed"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/httpx"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/pagereader"
	gotrafilatura "github.com/markusmobius/go-trafilatura"
)

const usage = "usage: go-scraper feed|extract [flags] [url...]"

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "feed":
		err = runFeed(os.Args[2:])
	case "extract":
		err = runExtract(os.Args[2:])
	default:
		err = fmt.Errorf("unknown command %q\n%s", os.Args[1], usage)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

type common struct {
	userAgent string
	timeout   time.Duration
}

func (c *common) register(fs *flag.FlagSet) {
	fs.StringVar(&c.userAgent, "ua", "NewsScraperBot/1.0", "User-Agent, sama dengan `userAgent` di scraper/config.json")
	fs.DurationVar(&c.timeout, "timeout", 15*time.Second, "batas waktu per request")
}

func runFeed(args []string) error {
	fs := flag.NewFlagSet("feed", flag.ExitOnError)
	var c common
	c.register(fs)
	limit := fs.Int("limit", 0, "jumlah URL maksimum (0 = semua)")
	fs.Parse(args)
	if fs.NArg() != 1 {
		return fmt.Errorf("feed needs exactly one RSS URL")
	}
	links, err := (&feed.Reader{Client: httpx.New(c.userAgent, c.timeout)}).Links(context.Background(), fs.Arg(0), *limit)
	for _, l := range links {
		fmt.Println(l)
	}
	return err
}

type result struct {
	URL     string          `json:"url"`
	Article *domain.Article `json:"article,omitempty"`
	Error   string          `json:"error,omitempty"`
}

func runExtract(args []string) error {
	fs := flag.NewFlagSet("extract", flag.ExitOnError)
	var c common
	c.register(fs)
	extractorName := fs.String("extractor", "rules", "rules (port extract-article.js) atau trafilatura")
	focus := fs.String("focus", "balanced", "trafilatura: balanced, precision, atau recall")
	fallback := fs.Bool("fallback", true, "trafilatura: pakai go-readability dan go-domdistiller jika hasil meragukan")
	extractTime := fs.Bool("extract-time", false, "trafilatura: ambil jam terbit, bukan hanya tanggal")
	maxPages := fs.Int("max-pages", domain.DefaultPageOptions.MaxPages, "halaman artikel maksimum yang diikuti")
	preferAll := fs.Bool("prefer-all-page", domain.DefaultPageOptions.PreferAllPage, "utamakan versi \"tampilkan semua\"")
	delay := fs.Duration("delay", 1500*time.Millisecond, "jeda antar-URL saat URL diberikan sebagai argumen")
	fs.Parse(args)

	extractor, err := newExtractor(*extractorName, *focus, *fallback, *extractTime)
	if err != nil {
		return err
	}
	scrape := &application.ScrapeArticle{
		Reader: &pagereader.HTTPPageReader{Client: httpx.New(c.userAgent, c.timeout), Extractor: extractor},
		Logger: slog.New(slog.NewTextHandler(os.Stderr, nil)),
	}
	defaults := domain.PageOptions{MaxPages: *maxPages, PreferAllPage: *preferAll}

	out := json.NewEncoder(os.Stdout)
	out.SetEscapeHTML(false)
	extract := func(req request) error {
		res := result{URL: req.URL}
		if a, err := scrape.Execute(context.Background(), req.URL, req.options(defaults)); err != nil {
			res.Error = err.Error()
		} else {
			res.Article = &a
		}
		return out.Encode(res)
	}

	// Mode stdin dipakai alat benchmark: proses tetap hidup, jeda antar-URL diatur pemanggil.
	if fs.NArg() == 0 {
		sc := bufio.NewScanner(os.Stdin)
		for sc.Scan() {
			line := strings.TrimSpace(sc.Text())
			if line == "" {
				continue
			}
			req, err := parseRequest(line)
			if err != nil {
				return err
			}
			if err := extract(req); err != nil {
				return err
			}
		}
		return sc.Err()
	}
	for i, u := range fs.Args() {
		if i > 0 {
			time.Sleep(*delay)
		}
		if err := extract(request{URL: u}); err != nil {
			return err
		}
	}
	return nil
}

func newExtractor(name, focus string, fallback, extractTime bool) (pagereader.Extractor, error) {
	switch name {
	case "rules":
		return rules.Extractor{}, nil
	case "trafilatura":
		e := trafilatura.Extractor{Fallback: fallback, ExtractTime: extractTime}
		switch focus {
		case "balanced":
			e.Focus = gotrafilatura.Balanced
		case "precision":
			e.Focus = gotrafilatura.FavorPrecision
		case "recall":
			e.Focus = gotrafilatura.FavorRecall
		default:
			return nil, fmt.Errorf("unknown focus %q", focus)
		}
		return e, nil
	default:
		return nil, fmt.Errorf("unknown extractor %q", name)
	}
}

// request: satu baris stdin. Field kosong memakai nilai flag.
type request struct {
	URL           string `json:"url"`
	MaxPages      *int   `json:"max_pages"`
	PreferAllPage *bool  `json:"prefer_all_page"`
}

func parseRequest(line string) (request, error) {
	if !strings.HasPrefix(line, "{") {
		return request{URL: line}, nil
	}
	var r request
	if err := json.Unmarshal([]byte(line), &r); err != nil {
		return request{}, fmt.Errorf("invalid request line: %w", err)
	}
	return r, nil
}

func (r request) options(defaults domain.PageOptions) domain.PageOptions {
	if r.MaxPages != nil {
		defaults.MaxPages = *r.MaxPages
	}
	if r.PreferAllPage != nil {
		defaults.PreferAllPage = *r.PreferAllPage
	}
	return defaults
}
