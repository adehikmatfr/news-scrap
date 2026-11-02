// Package dom berisi padanan API DOM browser yang dipakai extract-article.js, di atas golang.org/x/net/html.
// Tanpa CSS: elemen yang disembunyikan lewat stylesheet tetap terbaca, berbeda dengan `innerText` di browser.
package dom

import (
	"strings"

	"github.com/andybalholm/cascadia"
	"golang.org/x/net/html"
)

// Query dan QueryAll mencari di turunan root saja, seperti querySelector/querySelectorAll.
func Query(root *html.Node, sel cascadia.Selector) *html.Node {
	if root == nil {
		return nil
	}
	return cascadia.Query(root, sel)
}

func QueryAll(root *html.Node, sel cascadia.Selector) []*html.Node {
	if root == nil {
		return nil
	}
	return cascadia.QueryAll(root, sel)
}

func Attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

func HasAttr(n *html.Node, key string) bool {
	for _, a := range n.Attr {
		if a.Key == key {
			return true
		}
	}
	return false
}

func IsElement(n *html.Node) bool {
	return n != nil && n.Type == html.ElementNode
}

// ParentElement mengembalikan nil di atas <html>, seperti parentElement.
func ParentElement(n *html.Node) *html.Node {
	if n == nil || !IsElement(n.Parent) {
		return nil
	}
	return n.Parent
}

// Contains mengikuti Node.contains: node dianggap memuat dirinya sendiri.
func Contains(ancestor, n *html.Node) bool {
	for e := n; e != nil; e = e.Parent {
		if e == ancestor {
			return true
		}
	}
	return false
}

// Closest mengikuti Element.closest untuk nama tag: dimulai dari elemen itu sendiri.
func Closest(n *html.Node, tag string) *html.Node {
	for e := n; IsElement(e); e = e.Parent {
		if e.Data == tag {
			return e
		}
	}
	return nil
}

// TextContent menggabungkan semua teks turunan, termasuk isi <script> dan <style>, seperti Node.textContent.
func TextContent(n *html.Node) string {
	if n.Type == html.TextNode {
		return n.Data
	}
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == html.TextNode {
				b.WriteString(c.Data)
			} else {
				walk(c)
			}
		}
	}
	walk(n)
	return b.String()
}

var hiddenTags = map[string]bool{"script": true, "style": true, "noscript": true, "template": true, "head": true}

var blockTags = map[string]bool{
	"p": true, "div": true, "section": true, "article": true, "li": true, "ul": true, "ol": true,
	"h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true, "table": true, "tr": true,
	"pre": true, "header": true, "footer": true, "figure": true, "figcaption": true, "blockquote": true,
}

// InnerText mendekati HTMLElement.innerText tanpa CSS: teks yang tidak dirender dan atribut `hidden` dilewati,
// spasi dirapikan per baris, <br> dan elemen blok menjadi pemisah baris.
func InnerText(n *html.Node) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			switch {
			case c.Type == html.TextNode:
				b.WriteString(c.Data)
			case c.Type != html.ElementNode || hiddenTags[c.Data] || HasAttr(c, "hidden"):
			case c.Data == "br":
				b.WriteByte('\n')
			case blockTags[c.Data]:
				b.WriteByte('\n')
				walk(c)
				b.WriteByte('\n')
			default:
				walk(c)
			}
		}
	}
	walk(n)
	var lines []string
	for _, line := range strings.Split(b.String(), "\n") {
		if line = collapseCSS(line); line != "" {
			lines = append(lines, line)
		}
	}
	return strings.Join(lines, "\n")
}

// collapseCSS merapikan spasi seperti `white-space: normal`: hanya spasi, tab, dan baris baru;
// &nbsp; (U+00A0) dipertahankan, sama dengan innerText di browser.
func collapseCSS(s string) string {
	return strings.Join(strings.FieldsFunc(s, func(r rune) bool {
		return r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == '\f'
	}), " ")
}

// Collapse mengikuti `.replace(/\s+/g, ' ').trim()`; strings.Fields juga memecah spasi Unicode seperti &nbsp;.
func Collapse(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// Clone menyalin node beserta seluruh turunannya, seperti cloneNode(true).
func Clone(n *html.Node) *html.Node {
	c := &html.Node{Type: n.Type, DataAtom: n.DataAtom, Data: n.Data, Namespace: n.Namespace, Attr: append([]html.Attribute(nil), n.Attr...)}
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		c.AppendChild(Clone(child))
	}
	return c
}

// Body mengembalikan <body>, seperti document.body.
func Body(doc *html.Node) *html.Node {
	return Query(doc, cascadia.MustCompile("body"))
}
