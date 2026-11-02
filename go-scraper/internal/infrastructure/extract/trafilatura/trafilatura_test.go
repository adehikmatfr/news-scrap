package trafilatura

import (
	"net/url"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

const page = `<!doctype html><html lang="id"><head>
<title>Judul Uji - Situs</title>
<meta property="og:title" content="Judul Uji">
<meta name="author" content="Budi Santoso; Ani Lestari">
<meta property="article:published_time" content="2026-11-02T09:15:00+07:00">
<meta property="og:image" content="https://cdn.example.com/utama.jpg">
</head><body>
<nav><a href="/">Beranda</a> <a href="/politik">Politik</a></nav>
<article>
<h1>Judul Uji</h1>
<p>Paragraf pertama berisi kalimat berita yang cukup panjang untuk dianggap isi oleh ekstraktor, dengan beberapa klausa tambahan agar lolos ambang panjang minimum.</p>
<figure><img src="/img/foto.jpg" alt="Foto kegiatan"></figure>
<p>Paragraf kedua melanjutkan berita dengan rincian lain tentang peristiwa yang sama, juga ditulis panjang supaya kepadatan teksnya tinggi dan tidak dibuang.</p>
<p>Paragraf ketiga menutup berita dengan kutipan narasumber dan keterangan waktu kejadian yang lengkap serta jelas bagi pembaca.</p>
</article>
<footer>Hak cipta 2026</footer>
</body></html>`

func TestExtract(t *testing.T) {
	u, _ := url.Parse("https://www.example.com/berita/1")
	doc, _ := html.Parse(strings.NewReader(page))
	a := Extractor{Fallback: true}.Extract(doc, u)
	if a.Pagination.All != "" || len(a.Pagination.Pages) != 0 {
		t.Errorf("pagination = %+v, want none", a.Pagination)
	}
	if a.Title != "Judul Uji" {
		t.Errorf("title = %q", a.Title)
	}
	if len(a.Authors) != 2 || a.Authors[0] != "Budi Santoso" {
		t.Errorf("authors = %q", a.Authors)
	}
	if a.PublishedAt == nil || !strings.HasPrefix(*a.PublishedAt, "2026-11-02") {
		t.Errorf("published_at = %v", a.PublishedAt)
	}
	if got := strings.Count(a.ContentText, "\n\n"); got < 2 {
		t.Errorf("want paragraphs separated by blank lines, got %d separators: %q", got, a.ContentText)
	}
	if strings.Contains(a.ContentText, "Beranda") || strings.Contains(a.ContentText, "Hak cipta") {
		t.Errorf("navigation or footer leaked: %q", a.ContentText)
	}
	if len(a.Images) != 1 || a.Images[0].URL != "https://www.example.com/img/foto.jpg" {
		t.Errorf("images = %+v", a.Images)
	}
}
