// Package clean: pembersihan teks setelah ekstraksi, 11 aturan dari data sistem produksi Go (ADR-0005).
// Port bagian "Pembersihan teks" di scraper/src/infrastructure/browser/scripts/extract-article.js; ubah keduanya bersamaan.
// Spasi ditulis eksplisit `[ \t\n\x{00a0}]`, bukan `\s`, supaya sama persis dengan versi JS.
package clean

import (
	"regexp"
	"strings"
)

var (
	editorCodeEnd    = regexp.MustCompile(`[ \t\n\x{00a0}]*\([a-z]{2,5}(/[a-z]{2,5})+\)[ \t\n\x{00a0}]*$`)                        // 1. `(lil/sfr)` di ujung paragraf
	gambas           = regexp.MustCompile(`(?i)\[gambas:[^\]]*\]`)                                                                // 2
	spaceBeforePunct = regexp.MustCompile(`([^ \t\n\x{00a0}])[ \t\x{00a0}]+([.,;:!?])([ \t\n\x{00a0}]|$)`)                        // 3. `kata .` -> `kata.`
	dateline         = regexp.MustCompile(`^[\p{L} .'-]{2,40},[ \x{00a0}](CNN|CNBC) Indonesia[ \t\x{00a0}]*-{1,2}[ \t\x{00a0}]*`) // 4. hanya di awal teks
	parenOpen        = regexp.MustCompile(`\([ \t\n\x{00a0}]+`)                                                                   // 5. `( x )` -> `(x)`
	parenClose       = regexp.MustCompile(`[ \t\n\x{00a0}]+\)`)
	disclaimer       = regexp.MustCompile(`(?i)disclaimer[ \t\x{00a0}]+the information and publications`)       // 6 (dan 9, yang ada sebelum blok ini)
	readAlsoStart    = regexp.MustCompile(`(?i)^(baca|lihat)[ \t\x{00a0}]+juga\b`)                              // 7. paragraf "Baca juga ..."
	readAlsoInline   = regexp.MustCompile(`(?i)[ \t\x{00a0}]+(baca|lihat)[ \t\x{00a0}]+juga[ \t\x{00a0}]*:.*$`) // 7. penanda + judul sampai akhir paragraf
	tail             = []*regexp.Regexp{                                                                        // 8, 10: hanya di ujung teks
		regexp.MustCompile(`(?i)^learn something new in under a minute\b`),
		regexp.MustCompile(`(?i)^magazine:[ \t\x{00a0}]`),
	}
	photoLine   = regexp.MustCompile(`(?i)^\(?foto[ \t\x{00a0}]*:[^\n]{0,100}$`) // 11. paragraf kredit foto pendek
	photoParen  = regexp.MustCompile(`(?i)\(foto[ \t\x{00a0}]*:[^)]*\)`)         // 11. `(Foto: ...)` di dalam kalimat
	doubleSpace = regexp.MustCompile(`[ \t]{2,}`)
)

// Paragraphs membersihkan paragraf isi artikel; paragraf yang menjadi kosong dibuang.
func Paragraphs(paras []string) []string {
	out := []string{}
	for _, p := range paras {
		if readAlsoStart.MatchString(p) || photoLine.MatchString(p) {
			continue
		}
		t := gambas.ReplaceAllString(p, " ")
		t = photoParen.ReplaceAllString(t, " ")
		t = readAlsoInline.ReplaceAllString(t, "")
		t = parenOpen.ReplaceAllString(t, "(")
		t = parenClose.ReplaceAllString(t, ")")
		t = spaceBeforePunct.ReplaceAllString(t, "${1}${2}${3}")
		t = doubleSpace.ReplaceAllString(t, " ")
		t = editorCodeEnd.ReplaceAllString(t, "")
		if t = strings.TrimSpace(t); t != "" {
			out = append(out, t)
		}
	}
	if len(out) > 0 {
		if first := strings.TrimSpace(dateline.ReplaceAllString(out[0], "")); first != "" {
			out[0] = first
		} else {
			out = out[1:]
		}
	}
	for i, t := range out {
		if loc := disclaimer.FindStringIndex(t); loc != nil {
			out = out[:i]
			if head := strings.TrimSpace(t[:loc[0]]); head != "" {
				out = append(out, head)
			}
			break
		}
	}
	for len(out) > 0 && matchesAny(tail, out[len(out)-1]) {
		out = out[:len(out)-1]
	}
	return out
}

func matchesAny(res []*regexp.Regexp, s string) bool {
	for _, re := range res {
		if re.MatchString(s) {
			return true
		}
	}
	return false
}
