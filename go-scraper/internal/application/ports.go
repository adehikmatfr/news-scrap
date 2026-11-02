// Package application berisi usecase; hanya mengenal domain dan port. Padanan scraper/src/application/.
package application

import (
	"context"

	"github.com/adehikmatfr/news-scrap/go-scraper/internal/domain"
)

// PageReader membaca satu halaman artikel. Error hanya untuk kegagalan mengambil halaman;
// halaman yang isinya tidak terbaca dikembalikan dengan `ContentText` kosong.
type PageReader interface {
	Read(ctx context.Context, url string) (domain.Page, error)
}

type Logger interface {
	Warn(msg string, args ...any)
}
