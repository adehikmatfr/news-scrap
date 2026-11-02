package trafilatura

import (
	"net/url"
	"reflect"
	"strings"
	"testing"

	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/extract/rules"
	"golang.org/x/net/html"
)

const page = `<!doctype html><html lang="id"><head>
<title>Judul Uji - Situs</title>
<meta property="og:title" content="Judul Uji">
<meta name="author" content="Budi Santoso">
<meta property="article:published_time" content="2026-11-02T09:15:00+07:00">
<meta property="og:image" content="https://cdn.example.com/utama.jpg">
</head><body>
<nav><a href="/">Beranda</a> <a href="/politik">Politik</a></nav>
<article>
<h1>Judul Uji</h1>
<p>Jakarta, CNN Indonesia -- Paragraf pertama berisi kalimat berita yang cukup panjang untuk dianggap isi oleh ekstraktor, dengan beberapa klausa tambahan agar lolos ambang panjang minimum.</p>
<figure><img src="/img/foto.jpg" alt="Foto kegiatan"><figcaption>REUTERS/Fotografer</figcaption></figure>
<p>Paragraf kedua melanjutkan berita dengan rincian lain tentang peristiwa yang sama, juga ditulis panjang supaya kepadatan teksnya tinggi dan tidak dibuang.</p>
<p>ADVERTISEMENT</p>
<p>Paragraf ketiga menutup berita dengan kutipan narasumber dan keterangan waktu kejadian yang lengkap serta jelas bagi pembaca. (ahm/isa)</p>
<div class="related"><p>Berita terkait yang panjang dan bukan bagian dari isi artikel ini sama sekali, dengan judul berita lain.</p></div>
</article>
<footer>Hak cipta 2026</footer>
</body></html>`

func parse(t *testing.T) *html.Node {
	doc, err := html.Parse(strings.NewReader(page))
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func TestExtract(t *testing.T) {
	u, _ := url.Parse("https://www.example.com/berita/1")
	got := Extractor{Fallback: true}.Extract(parse(t), u)
	want := rules.Extractor{}.Extract(parse(t), u)

	// Metadata, gambar, dan pagination diambil dengan aturan rules.
	got.ContentText, got.WordCount, want.ContentText, want.WordCount = "", 0, "", 0
	if !reflect.DeepEqual(got, want) {
		t.Errorf("metadata differs from rules:\n got %+v\nwant %+v", got, want)
	}

	a := Extractor{Fallback: true}.Extract(parse(t), u)
	if !strings.HasPrefix(a.ContentText, "Paragraf pertama") || !strings.Contains(a.ContentText, "Paragraf ketiga") {
		t.Errorf("content = %q", a.ContentText)
	}
	for _, noise := range []string{"Beranda", "Hak cipta", "ADVERTISEMENT", "REUTERS", "(ahm/isa)", "Berita terkait", "CNN Indonesia"} {
		if strings.Contains(a.ContentText, noise) {
			t.Errorf("noise %q leaked: %q", noise, a.ContentText)
		}
	}
}
