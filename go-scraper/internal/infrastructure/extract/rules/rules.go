// Package rules: port 1:1 scraper/src/infrastructure/browser/scripts/extract-article.js, dijalankan pada HTML
// yang dikirim server, bukan pada DOM browser. Setiap perubahan aturan di extract-article.js diterapkan juga di sini.
// Prioritas metadata: JSON-LD (NewsArticle) -> OpenGraph/meta -> parsing DOM.
package rules

import (
	"encoding/json"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/adehikmatfr/news-scrap/go-scraper/internal/domain"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/extract/clean"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/extract/dom"
	"github.com/adehikmatfr/news-scrap/go-scraper/internal/infrastructure/extract/pagination"
	"github.com/andybalholm/cascadia"
	"golang.org/x/net/html"
)

type Extractor struct{}

var (
	noiseTags = map[string]bool{
		"script": true, "style": true, "noscript": true, "iframe": true, "ins": true, "aside": true, "form": true,
		"button": true, "svg": true, "figure": true, "figcaption": true, "nav": true, "footer": true, "blockquote": true,
	}
	// Token kelas/id (dipisah spasi, `-`, `_`) yang menandai elemen bukan isi berita.
	noiseClass = regexp.MustCompile(`(?i)(^|[\s_-])(ads?|advert\w*|iklan|banner|promo\w*|sponsor\w*|related|terkait|rekomendasi|recommend\w*|baca-?juga|bacajuga|lihat-?juga|share|social|sosmed|comments?|komentar|newsletter|subscribe|tags?|topik|breadcrumbs?|nav\w*|menu|sidebar|footer|popular|terpopuler|trending|widget|parallax|author|penulis|reporter|byline|redaksi|date|time|caption)($|[\s_-])`)
	bodyClass  = regexp.MustCompile(`(?i)article|body|content|entry|main|post|text|story|detail|read|isi|berita`)
	blockTags  = map[string]bool{
		"p": true, "div": true, "section": true, "article": true, "li": true, "ul": true, "ol": true, "h2": true,
		"h3": true, "h4": true, "h5": true, "h6": true, "table": true, "tr": true, "pre": true, "header": true,
	}
	bodySelectors = compileAll(
		`[itemprop="articleBody"]`, `.detail__body-text`, `.read__content`, `.post-content`, `.entry-content`,
		`.article-content`, `.article-body`, `.article__body`, `.article__content`, `.story-body`, `.post-body`,
		`.detail-content`, `.content-detail`, `.detail-desc`, `.main-content-detail`, `.c-detail`, `.news-content`,
		`.isi-berita`, `[class*="article-content"]`, `[class*="article-body"]`, `[class*="content-body"]`,
		`[class*="body-text"]`, `[class*="detail-text"]`,
	)
	// Baris yang terlihat di dalam wadah isi tetapi bukan isi berita.
	noiseLine = []*regexp.Regexp{
		regexp.MustCompile(`(?i)^(advertisement|iklan|scroll to continue( with content)?|loading\.*)$`),
		regexp.MustCompile(`(?i)^(baca (juga|berita|selengkapnya|artikel)|baca\s*:|lihat juga|simak (juga|video|berita)|saksikan( juga)?|tonton( juga)?)\b`),
		regexp.MustCompile(`(?i)^(ikuti|follow|dapatkan|download|unduh|klik)\b.{0,80}(whatsapp|channel|google news|aplikasi|instagram|telegram|update|berita terbaru|di ?sini)`),
		regexp.MustCompile(`(?i)^(pewarta|editor|reporter|penulis|fotografer|redaktur|sumber)\s*:`),
		regexp.MustCompile(`(?i)^(copyright|hak cipta|©)`),
		regexp.MustCompile(`(?i)^dilarang (keras )?mengambil konten`),
		regexp.MustCompile(`(?i)^halaman\s*:?(\s*\d|\s*$)`), // `Halaman: 2` atau label `Halaman:` yang tersisa tanpa link
		regexp.MustCompile(`(?i)^(follow|ikuti)( kami)?$`),  // label ajakan follow yang tersisa tanpa nama kanal
		regexp.MustCompile(`(?i)^\[gambas:[^\]]*\]$`),
		regexp.MustCompile(`(?i)^\(?[a-z]{2,5}(/[a-z]{2,5})*\)?$`), // inisial editor, mis. `(ahm)`
		regexp.MustCompile(`^\([\p{L} .'/-]{2,60}\)$`),             // kredit redaksi dalam kurung
		regexp.MustCompile(`(?i)\bmenyajikan (informasi|berita) terbaru\b`),
		regexp.MustCompile(`^[\W\d_]{0,3}$`), // tanda baca atau huruf awal (drop cap) yang terpisah
	}
	skipImage = regexp.MustCompile(`(?i)logo|icon|avatar|sprite|pixel`)
	articleLD = regexp.MustCompile(`(News)?Article|BlogPosting|ReportageNewsArticle`)

	selUnits     = cascadia.MustCompile("p, div, section, article, td")
	selLinks     = cascadia.MustCompile("a")
	selP         = cascadia.MustCompile("p")
	selImg       = cascadia.MustCompile("img")
	selLD        = cascadia.MustCompile(`script[type="application/ld+json"]`)
	selCanonical = cascadia.MustCompile(`link[rel="canonical"]`)
	selTitle     = cascadia.MustCompile("title")
	selFigcap    = cascadia.MustCompile("figcaption")
	selTagLinks  = cascadia.MustCompile(`a[href*="/tag/"]`)
)

func compileAll(sels ...string) []cascadia.Selector {
	out := make([]cascadia.Selector, len(sels))
	for i, s := range sels {
		out[i] = cascadia.MustCompile(s)
	}
	return out
}

// Extract membaca satu halaman. Halaman tanpa wadah isi menghasilkan `ContentText` kosong, bukan error.
func (Extractor) Extract(doc *html.Node, here *url.URL) domain.Page {
	x := &page{doc: doc, here: here, body: dom.Body(doc)}
	ld := x.jsonLD()
	content := x.content()
	images, mainImage := x.images(content, ld)

	a := domain.Article{
		URL:         x.canonical(),
		Title:       first(str(ld["headline"]), x.meta(`meta[property="og:title"]`), x.documentTitle()),
		Description: first(str(ld["description"]), x.meta(`meta[name="description"]`), x.meta(`meta[property="og:description"]`)),
		Authors:     authors(ld, x.meta(`meta[name="author"]`)),
		PublishedAt: optional(first(str(ld["datePublished"]), x.meta(`meta[property="article:published_time"]`))),
		UpdatedAt:   optional(first(str(ld["dateModified"]), x.meta(`meta[property="article:modified_time"]`))),
		Section:     first(firstStr(ld["articleSection"]), x.meta(`meta[property="article:section"]`)),
		Tags:        x.tags(ld),
		MainImage:   mainImage,
		Images:      images,
	}
	paragraphs := x.paragraphs(content)
	a.ContentText = strings.Join(paragraphs, "\n\n")
	a.WordCount = domain.CountWords(strings.Join(paragraphs, " "))
	return domain.Page{Article: a, Pagination: pagination.Find(doc, here)}
}

type page struct {
	doc, body *html.Node
	here      *url.URL
}

func (x *page) meta(sel string) string {
	if n := dom.Query(x.doc, cascadia.MustCompile(sel)); n != nil {
		return strings.TrimSpace(dom.Attr(n, "content"))
	}
	return ""
}

func (x *page) abs(u string) string {
	if u == "" {
		return ""
	}
	r, err := x.here.Parse(strings.TrimSpace(u))
	if err != nil {
		return ""
	}
	return r.String()
}

func (x *page) canonical() string {
	if n := dom.Query(x.doc, selCanonical); n != nil {
		if u := x.abs(dom.Attr(n, "href")); u != "" {
			return u
		}
	}
	return x.here.String()
}

func (x *page) documentTitle() string {
	if n := dom.Query(x.doc, selTitle); n != nil {
		return dom.Collapse(dom.TextContent(n))
	}
	return ""
}

// --- JSON-LD ---

func (x *page) jsonLD() map[string]any {
	var items []any
	for _, s := range dom.QueryAll(x.doc, selLD) {
		var data any
		if json.Unmarshal([]byte(dom.TextContent(s)), &data) != nil {
			continue // JSON-LD rusak, abaikan
		}
		stack, ok := data.([]any)
		if !ok {
			stack = []any{data}
		}
		for _, d := range stack {
			if m, ok := d.(map[string]any); ok && m["@graph"] != nil {
				if g, ok := m["@graph"].([]any); ok {
					items = append(items, g...)
				}
			} else {
				items = append(items, d)
			}
		}
	}
	for _, d := range items {
		if m, ok := d.(map[string]any); ok && articleLD.MatchString(strings.Join(toStrings(m["@type"]), " ")) {
			return m
		}
	}
	return map[string]any{}
}

func authors(ld map[string]any, metaAuthor string) []string {
	if names := names(ld["author"]); len(names) > 0 {
		return names
	}
	if metaAuthor != "" {
		return []string{metaAuthor}
	}
	return []string{}
}

func names(v any) []string {
	out := []string{}
	for _, a := range asList(v) {
		switch t := a.(type) {
		case string:
			if t != "" {
				out = append(out, t)
			}
		case map[string]any:
			if n := str(t["name"]); n != "" {
				out = append(out, n)
			}
		}
	}
	return out
}

// --- Isi artikel ---
// Wadah isi dipilih dari selector yang umum di situs berita, lalu diperiksa dengan skor kepadatan
// paragraf (mirip Readability). Situs dengan struktur yang tidak dikenal tetap tertangani lewat skor.

func classOf(n *html.Node) string {
	return dom.Attr(n, "class") + " " + dom.Attr(n, "id")
}

func isNoise(n *html.Node) bool {
	return noiseTags[n.Data] || noiseClass.MatchString(classOf(n)) || dom.HasAttr(n, "hidden") || dom.Attr(n, "aria-hidden") == "true"
}

func (x *page) insideNoise(n, root *html.Node) bool {
	for e := n; dom.IsElement(e) && e != root && e != x.body; e = e.Parent {
		if isNoise(e) {
			return true
		}
	}
	return false
}

func directText(n *html.Node) string {
	var parts []string
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.TextNode {
			parts = append(parts, c.Data)
		}
	}
	return dom.Collapse(strings.Join(parts, " "))
}

type unit struct {
	el          *html.Node
	len, commas int
}

func runeLen(s string) int { return utf8.RuneCountInString(s) }

func linkDensity(n *html.Node) float64 {
	total := runeLen(dom.TextContent(n))
	if total == 0 {
		total = 1
	}
	links := 0
	for _, a := range dom.QueryAll(n, selLinks) {
		links += runeLen(dom.TextContent(a))
	}
	return float64(links) / float64(total)
}

func (x *page) content() *html.Node {
	if x.body == nil {
		return nil
	}
	// Satuan teks: <p> yang cukup panjang, atau elemen blok yang teksnya langsung dipisah <br> (tanpa <p>).
	var units []unit
	for _, el := range dom.QueryAll(x.body, selUnits) {
		if x.insideNoise(el, nil) {
			continue
		}
		text, min := directText(el), 80
		if el.Data == "p" {
			text, min = dom.Collapse(dom.TextContent(el)), 25
		}
		if l := runeLen(text); l >= min {
			units = append(units, unit{el, l, strings.Count(text, ",")})
		}
	}
	unitText := func(root *html.Node) int {
		sum := 0
		for _, u := range units {
			if dom.Contains(root, u.el) {
				sum += u.len
			}
		}
		return sum
	}

	// Urutan penyisipan dipertahankan: skor yang sama dimenangkan elemen yang lebih dulu tercatat, seperti Map di JS.
	scores := map[*html.Node]float64{}
	var order []*html.Node
	addScore := func(el *html.Node, s float64) {
		if el == nil || el == x.body {
			return
		}
		if _, ok := scores[el]; !ok {
			order = append(order, el)
		}
		scores[el] += s
	}
	for _, u := range units {
		s := float64(1 + u.commas + min(u.len/100, 3))
		container := u.el
		if u.el.Data == "p" {
			container = dom.ParentElement(u.el)
		}
		addScore(container, s)
		addScore(dom.ParentElement(container), s/2)
	}
	var best *html.Node
	bestScore := 0.0
	for _, el := range order {
		weight := 0.0
		if bodyClass.MatchString(classOf(el)) {
			weight += 25
		}
		if noiseClass.MatchString(classOf(el)) {
			weight -= 25
		}
		if s := (scores[el] + weight) * (1 - linkDensity(el)); s > bestScore {
			best, bestScore = el, s
		}
	}
	// Naik ke induk jika induk memuat jauh lebih banyak isi, mis. artikel yang dipecah ke beberapa wadah bersaudara.
	for best != nil {
		parent := dom.ParentElement(best)
		if parent == nil || parent == x.body {
			break
		}
		if isNoise(parent) || linkDensity(parent) > 0.35 || float64(unitText(parent)) < float64(unitText(best))*1.2 {
			break
		}
		best = parent
	}

	// Selector dipakai jika cocok dengan hasil skor (memuat atau dimuat olehnya, atau isinya setara); selain itu pakai skor.
	bestText := 0
	if best != nil {
		bestText = unitText(best)
	}
	for _, sel := range bodySelectors {
		el := dom.Query(x.doc, sel)
		if el == nil || unitText(el) <= 200 {
			continue
		}
		if best == nil || dom.Contains(el, best) || dom.Contains(best, el) || float64(unitText(el)) >= float64(bestText)*0.7 {
			return el
		}
	}
	if bestText > 200 {
		return best
	}
	return nil
}

func isNoiseLine(t string) bool {
	for _, re := range noiseLine {
		if re.MatchString(t) {
			return true
		}
	}
	return false
}

// Paragraphs dan PruneNoise dipakai ekstraktor lain (adapter trafilatura) agar teks dibaca dan dibersihkan
// dengan aturan yang sama: per <p> atau per baris, filter baris sampah, lalu pembersih 11 aturan.
func Paragraphs(root *html.Node) []string { return (&page{}).paragraphs(root) }

// KnownContainers mengembalikan elemen di dalam root yang cocok dengan daftar selector wadah isi, sesuai urutan daftar.
func KnownContainers(root *html.Node) []*html.Node {
	var out []*html.Node
	for _, sel := range bodySelectors {
		if el := dom.Query(root, sel); el != nil {
			out = append(out, el)
		}
	}
	return out
}

// PruneNoise membuang elemen bukan berita (NOISE_TAGS, NOISE_CLASS, `hidden`) dari seluruh dokumen.
func PruneNoise(doc *html.Node) {
	var noise []*html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if dom.IsElement(c) && c.Data != "html" && c.Data != "head" && c.Data != "body" && isNoise(c) {
				noise = append(noise, c)
				continue
			}
			walk(c)
		}
	}
	walk(doc)
	for _, n := range noise {
		n.Parent.RemoveChild(n)
	}
}

// Isi diambil per <p> jika <p> memuat sebagian besar teks; jika tidak (isi dipisah <br>), per baris blok.
func (x *page) paragraphs(body *html.Node) []string {
	if body == nil {
		return nil
	}
	var fromP []string
	for _, p := range dom.QueryAll(body, selP) {
		if x.insideNoise(p, body) {
			continue
		}
		if t := strings.TrimSpace(dom.InnerText(p)); t != "" {
			fromP = append(fromP, t)
		}
	}
	lines := collectLines(body)
	chosen := lines
	if float64(runeLen(strings.Join(fromP, ""))) >= float64(runeLen(strings.Join(lines, "")))*0.6 {
		chosen = fromP
	}
	kept := []string{}
	for _, t := range chosen {
		if !isNoiseLine(t) {
			kept = append(kept, t)
		}
	}
	return clean.Paragraphs(kept)
}

func collectLines(root *html.Node) []string {
	var out []string
	var buffer strings.Builder
	flush := func() {
		if t := dom.Collapse(buffer.String()); t != "" {
			out = append(out, t)
		}
		buffer.Reset()
	}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == html.TextNode {
				buffer.WriteString(c.Data)
			}
			if c.Type != html.ElementNode || isNoise(c) {
				continue
			}
			if c.Data == "br" {
				flush()
				continue
			}
			block := blockTags[c.Data]
			if block {
				flush()
			}
			walk(c)
			if block {
				flush()
			}
		}
	}
	walk(root)
	flush()
	return out
}

// --- Gambar (dukung lazy-load) ---

func (x *page) imgURL(img *html.Node) string {
	srcset := first(dom.Attr(img, "srcset"), dom.Attr(img, "data-srcset"))
	if srcset != "" {
		type cand struct {
			url string
			w   int
		}
		var cands []cand
		for _, c := range strings.Split(srcset, ",") {
			f := strings.Fields(strings.TrimSpace(c))
			if len(f) == 0 {
				cands = append(cands, cand{})
				continue
			}
			w := 0
			if len(f) > 1 {
				w = parseIntPrefix(f[1])
			}
			cands = append(cands, cand{f[0], w})
		}
		sort.SliceStable(cands, func(i, j int) bool { return cands[i].w > cands[j].w })
		if len(cands) > 0 && cands[0].url != "" {
			return x.abs(cands[0].url)
		}
	}
	return x.abs(first(dom.Attr(img, "data-src"), dom.Attr(img, "data-original"), dom.Attr(img, "src")))
}

// parseIntPrefix mengikuti parseInt JS: angka di awal string, 0 jika tidak ada.
func parseIntPrefix(s string) int {
	end := 0
	for end < len(s) && s[end] >= '0' && s[end] <= '9' {
		end++
	}
	n, _ := strconv.Atoi(s[:end])
	return n
}

func (x *page) images(body *html.Node, ld map[string]any) ([]domain.Image, string) {
	scope := x.doc
	if body != nil {
		scope = body
		if art := dom.Closest(body, "article"); art != nil {
			scope = art
		}
	}
	images := []domain.Image{}
	seen := map[string]bool{}
	for _, img := range dom.QueryAll(scope, selImg) {
		u := x.imgURL(img)
		if u == "" || strings.HasPrefix(u, "data:") || seen[u] || skipImage.MatchString(u) {
			continue
		}
		seen[u] = true
		images = append(images, domain.Image{URL: u, Caption: caption(img)})
	}
	// Gambar utama sering berada di luar isi artikel, jadi disertakan di urutan pertama.
	var ldImage string
	for _, i := range asList(ld["image"]) {
		switch t := i.(type) {
		case string:
			ldImage = t
		case map[string]any:
			ldImage = str(t["url"])
		}
		if ldImage != "" {
			break
		}
	}
	mainImage := x.abs(first(ldImage, x.meta(`meta[property="og:image"]`)))
	if mainImage != "" && !seen[mainImage] {
		images = append([]domain.Image{{URL: mainImage}}, images...)
	}
	return images, mainImage
}

func caption(img *html.Node) *string {
	if fig := dom.Closest(img, "figure"); fig != nil {
		if fc := dom.Query(fig, selFigcap); fc != nil {
			if t := strings.TrimSpace(dom.InnerText(fc)); t != "" {
				return &t
			}
		}
	}
	if alt := dom.Attr(img, "alt"); alt != "" {
		return &alt
	}
	return nil
}

// --- Tag: dari metadata, fallback ke link /tag/ (pola umum situs berita Indonesia) ---

func (x *page) tags(ld map[string]any) []string {
	var raw []string
	if kw := asList(ld["keywords"]); len(kw) > 0 {
		for _, k := range kw {
			raw = append(raw, anyString(k))
		}
	} else if m := x.meta(`meta[name="keywords"]`); m != "" {
		raw = strings.Split(m, ",")
	}
	tags := []string{}
	for _, t := range raw {
		if t = strings.TrimSpace(t); t != "" {
			tags = append(tags, t)
		}
	}
	if len(tags) > 0 {
		return tags
	}
	seen := map[string]bool{}
	for _, a := range dom.QueryAll(x.doc, selTagLinks) {
		if t := strings.TrimSpace(dom.InnerText(a)); t != "" && !seen[t] {
			seen[t] = true
			tags = append(tags, t)
		}
	}
	return tags
}

// --- Nilai JSON-LD: padanan `[].concat(v)` dan operator `||` di JS ---

func asList(v any) []any {
	switch t := v.(type) {
	case nil:
		return nil
	case []any:
		return t
	default:
		return []any{t}
	}
}

func str(v any) string {
	s, _ := v.(string)
	return strings.TrimSpace(s)
}

func firstStr(v any) string {
	for _, x := range asList(v) {
		if s := str(x); s != "" {
			return s
		}
	}
	return ""
}

func anyString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case nil:
		return ""
	default:
		b, _ := json.Marshal(t)
		return string(b)
	}
}

func toStrings(v any) []string {
	var out []string
	for _, x := range asList(v) {
		out = append(out, anyString(x))
	}
	return out
}

func first(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
