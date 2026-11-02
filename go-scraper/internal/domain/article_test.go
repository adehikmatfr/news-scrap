package domain

import "testing"

func TestMergePages(t *testing.T) {
	a := MergePages([]Article{
		{Title: "Judul", ContentText: "satu dua", Images: []Image{{URL: "a.jpg"}, {URL: "b.jpg"}}},
		{Title: "Lain", ContentText: "tiga", Images: []Image{{URL: "b.jpg"}, {URL: "c.jpg"}}},
	})
	if a.Title != "Judul" || a.ContentText != "satu dua\n\ntiga" || a.WordCount != 3 {
		t.Fatalf("got %+v", a)
	}
	if len(a.Images) != 3 {
		t.Fatalf("images = %+v", a.Images)
	}
}
