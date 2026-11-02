package pagination

import (
	"net/url"
	"reflect"
	"strings"
	"testing"

	"github.com/adehikmatfr/news-scrap/go-scraper/internal/domain"
	"golang.org/x/net/html"
)

func TestFindPagination(t *testing.T) {
	cases := []struct {
		name, here, links string
		want              domain.Pagination
	}{
		{
			name:  "query page dan versi all",
			here:  "https://a.com/read/1/judul",
			links: `<a href="?page=3">3</a><a href="/read/1/judul?page=2">2</a><a href="?page=all">Semua</a><a href="/read/2/lain?page=2">lain</a>`,
			want:  domain.Pagination{All: "https://a.com/read/1/judul?page=all", Pages: []string{"https://a.com/read/1/judul?page=2", "https://a.com/read/1/judul?page=3"}},
		},
		{
			name:  "path /N dan teks tampilkan semua",
			here:  "https://a.com/read/1/judul",
			links: `<a href="/read/1/judul/2">2</a><a href="/read/1/judul?show=1"> Tampilkan  Semua </a><a href="https://b.com/read/1/judul/3">luar</a>`,
			want:  domain.Pagination{All: "https://a.com/read/1/judul?show=1", Pages: []string{"https://a.com/read/1/judul/2"}},
		},
		{
			name:  "halaman 1 dan link ke halaman ini sendiri diabaikan",
			here:  "https://a.com/read/1/judul?page=all",
			links: `<a href="?page=1">1</a><a href="?page=all#top">all</a>`,
			want:  domain.Pagination{Pages: []string{}},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			doc, _ := html.Parse(strings.NewReader("<body>" + c.links + "</body>"))
			here, _ := url.Parse(c.here)
			if got := Find(doc, here); !reflect.DeepEqual(got, c.want) {
				t.Errorf("got %+v, want %+v", got, c.want)
			}
		})
	}
}
