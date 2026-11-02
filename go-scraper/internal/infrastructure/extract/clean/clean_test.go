package clean

import (
	"reflect"
	"testing"
)

// Contoh diambil dari tabel 11 aturan sistem produksi (ADR-0005).
func TestParagraphs(t *testing.T) {
	cases := []struct {
		name string
		in   []string
		want []string
	}{
		{"1 kode redaksi di ujung", []string{"Isi berita.", "Bantuan disalurkan ke 30 daerah. (lil/sfr)"}, []string{"Isi berita.", "Bantuan disalurkan ke 30 daerah."}},
		{"1+2 kode redaksi dan Gambas", []string{"Isi berita.", "(luc/luc) [Gambas:Video CNBC]"}, []string{"Isi berita."}},
		{"2 Gambas di tengah", []string{"Awal [Gambas:Video CNBC] akhir."}, []string{"Awal akhir."}},
		{"3 spasi sebelum tanda baca", []string{"cost of capital . Naluri pasar , kata dia ; lalu : selesai !"}, []string{"cost of capital. Naluri pasar, kata dia; lalu: selesai!"}},
		{"4 dateline CNN", []string{"Jakarta, CNN Indonesia -- Harga naik."}, []string{"Harga naik."}},
		{"4 dateline CNBC tanpa spasi", []string{"Jakarta, CNBC Indonesia- Harga naik."}, []string{"Harga naik."}},
		{"4 dateline sendirian", []string{"Jakarta, CNN Indonesia --", "Harga naik."}, []string{"Harga naik."}},
		{"4 dateline hanya di awal", []string{"Harga naik.", "Jakarta, CNN Indonesia -- kutipan."}, []string{"Harga naik.", "Jakarta, CNN Indonesia -- kutipan."}},
		{"5 spasi dalam kurung", []string{"Mekanisme ( circuit breaker ) aktif."}, []string{"Mekanisme (circuit breaker) aktif."}},
		{"6 disclaimer", []string{"Analisis.", "Ringkasan. Disclaimer The information and publications are not meant to be...", "Read more in the Terms of Use."}, []string{"Analisis.", "Ringkasan."}},
		{"7 baca juga dan lihat juga", []string{"Lihat Juga: Berita lain", "Ia berkata, ujarnya. Lihat Juga : 2 Tahun Prabowo-Gibran, Danantara"}, []string{"Ia berkata, ujarnya."}},
		{"8 dan 10 hanya di ujung", []string{"Isi.", "Magazine: AI agents help rescue ETH", "Learn something new in under a minute. Our educational Shorts"}, []string{"Isi."}},
		{"11 kredit foto", []string{"Foto: dok Istimewa", "Dividen dibayar (Foto: CNBC Indonesia/Muhammad Sabki) tahun ini."}, []string{"Dividen dibayar tahun ini."}},
		{"isi biasa tidak berubah", []string{"Harga BBM (Pertalite) naik 5%, kata Menteri: \"Sudah dihitung.\""}, []string{"Harga BBM (Pertalite) naik 5%, kata Menteri: \"Sudah dihitung.\""}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Paragraphs(c.in); !reflect.DeepEqual(got, c.want) {
				t.Errorf("got %q, want %q", got, c.want)
			}
		})
	}
}
