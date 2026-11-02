package rules

import (
	"net/url"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

const article = `<!doctype html><html><head>
<title>Judul Halaman - Situs</title>
<link rel="canonical" href="/berita/1">
<meta property="og:title" content="Judul OG">
<meta property="og:image" content="https://cdn.example.com/utama.jpg">
<meta name="keywords" content="politik, pemilu">
<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"NewsArticle","headline":"Judul LD","datePublished":"2026-11-02T09:15:00+07:00","author":[{"name":"Budi Santoso"},"Ani Lestari"],"articleSection":["Politik"]}]}</script>
</head><body>
<nav class="menu"><a href="/">Beranda</a></nav>
<div class="detail__body-text">
  <p>Jakarta - Paragraf pertama berisi kalimat berita, dengan koma, yang cukup panjang untuk dihitung sebagai satuan isi.</p>
  <div class="ads-slot"><p>ADVERTISEMENT</p></div>
  <p>SCROLL TO CONTINUE WITH CONTENT</p>
  <figure><img data-original="/img/foto.jpg" src="data:image/gif;base64,R0l"><figcaption>Foto: Dok. Redaksi</figcaption></figure>
  <p>Paragraf kedua melanjutkan berita, dengan rincian lain, tentang peristiwa yang sama dan cukup panjang juga.</p>
  <p>Baca juga: Berita lain yang tidak terkait</p>
  <p>Paragraf ketiga menutup berita, dengan kutipan narasumber, dan keterangan waktu kejadian yang lengkap.</p>
  <p>(ahm/isa)</p>
  <a href="?page=2">2</a>
</div>
<footer>Hak cipta 2026</footer>
</body></html>`

func TestExtract(t *testing.T) {
	doc, _ := html.Parse(strings.NewReader(article))
	here, _ := url.Parse("https://www.example.com/berita/1")
	p := Extractor{}.Extract(doc, here)

	if p.Title != "Judul LD" || p.URL != "https://www.example.com/berita/1" || p.Section != "Politik" {
		t.Errorf("metadata: title=%q url=%q section=%q", p.Title, p.URL, p.Section)
	}
	if len(p.Authors) != 2 || p.Authors[1] != "Ani Lestari" {
		t.Errorf("authors = %q", p.Authors)
	}
	if p.PublishedAt == nil || *p.PublishedAt != "2026-11-02T09:15:00+07:00" {
		t.Errorf("published_at = %v", p.PublishedAt)
	}
	if len(p.Tags) != 2 || p.Tags[1] != "pemilu" {
		t.Errorf("tags = %q", p.Tags)
	}
	paras := strings.Split(p.ContentText, "\n\n")
	if len(paras) != 3 || !strings.HasPrefix(paras[0], "Jakarta - Paragraf pertama") || !strings.HasPrefix(paras[2], "Paragraf ketiga") {
		t.Errorf("content = %q", p.ContentText)
	}
	for _, noise := range []string{"ADVERTISEMENT", "SCROLL", "Baca juga", "(ahm/isa)", "Foto:", "Beranda", "Hak cipta"} {
		if strings.Contains(p.ContentText, noise) {
			t.Errorf("noise %q leaked", noise)
		}
	}
	if len(p.Images) != 2 || p.Images[0].URL != "https://cdn.example.com/utama.jpg" || p.Images[1].URL != "https://www.example.com/img/foto.jpg" {
		t.Errorf("images = %+v", p.Images)
	}
	if c := p.Images[1].Caption; c == nil || *c != "Foto: Dok. Redaksi" {
		t.Errorf("caption = %v", c)
	}
	if len(p.Pagination.Pages) != 1 || p.Pagination.Pages[0] != "https://www.example.com/berita/1?page=2" {
		t.Errorf("pagination = %+v", p.Pagination)
	}
}

func TestBrSeparatedContentIsCollectedPerLine(t *testing.T) {
	long := "Baris isi berita yang dipisah dengan br, cukup panjang, supaya dihitung sebagai satuan teks oleh skor kepadatan"
	doc, _ := html.Parse(strings.NewReader(`<html><body><div class="detail-desc">` + long + ` satu.<br><br>` + long + ` dua.<br>` + long + ` tiga.<br>loading...</div></body></html>`))
	here, _ := url.Parse("https://www.example.com/read/1")
	p := Extractor{}.Extract(doc, here)
	if got := len(strings.Split(p.ContentText, "\n\n")); got != 3 || strings.Contains(p.ContentText, "loading") {
		t.Errorf("got %d lines: %q", got, p.ContentText)
	}
}

func TestNoContainerGivesEmptyContent(t *testing.T) {
	doc, _ := html.Parse(strings.NewReader(`<html><body><p>pendek</p></body></html>`))
	here, _ := url.Parse("https://www.example.com/")
	if p := (Extractor{}).Extract(doc, here); p.ContentText != "" || p.WordCount != 0 {
		t.Errorf("want empty content, got %q", p.ContentText)
	}
}

// innerText di browser mempertahankan &nbsp;; port Go harus menghasilkan teks yang sama persis.
func TestKeepsNonBreakingSpaceLikeInnerText(t *testing.T) {
	long := "Paragraf isi berita, dengan koma, yang cukup panjang untuk dihitung sebagai satuan isi artikel di halaman."
	doc, _ := html.Parse(strings.NewReader(`<html><body><div class="detail-text"><p>Jakarta,&nbsp;CNN ` + long + `</p><p>` + long + `</p><p>` + long + `</p></div></body></html>`))
	here, _ := url.Parse("https://www.example.com/a")
	if p := (Extractor{}).Extract(doc, here); !strings.HasPrefix(p.ContentText, "Jakarta, CNN") {
		t.Errorf("content = %q", p.ContentText[:20])
	}
}
