// Package httpx mengambil halaman lewat net/http dengan User-Agent tetap dan batas ukuran.
// robots.txt tidak diperiksa, sama dengan scraper Bun; sumber dipilih manual di scraper/config.json.
package httpx

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

const maxBodyBytes = 8 << 20

type Client struct {
	http      *http.Client
	userAgent string
}

func New(userAgent string, timeout time.Duration) *Client {
	return &Client{http: &http.Client{Timeout: timeout}, userAgent: userAgent}
}

// Response berisi URL akhir setelah redirect, dipakai untuk menyelesaikan URL relatif di halaman.
type Response struct {
	URL  *url.URL
	Body []byte
}

func (c *Client) Get(ctx context.Context, rawURL string) (*Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept-Language", "id-ID,id;q=0.9,en;q=0.8")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, rawURL)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))
	if err != nil {
		return nil, err
	}
	return &Response{URL: resp.Request.URL, Body: body}, nil
}
