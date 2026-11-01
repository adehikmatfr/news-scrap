// Implementasi palsu untuk port, supaya usecase bisa diuji tanpa browser atau jaringan.

export const silentLogger = { info() {}, warn() {}, error() {} };

const page = (content, pagination = {}) => ({
  title: 'Judul',
  content_text: content,
  word_count: content.split(/\s+/).filter(Boolean).length,
  images: [],
  pagination: { all: null, pages: [], ...pagination },
});
export { page as fakePage };

export class FakePageReader {
  constructor(pages) {
    this.pages = pages;
    this.reads = [];
  }

  async read(url) {
    this.reads.push(url);
    const result = this.pages[url];
    if (!result) throw new Error(`no page for ${url}`);
    return result;
  }
}

export class FakeSentStore {
  constructor(sent = []) {
    this.sent = new Map(sent.map((url) => [url, {}]));
  }

  async has(url) {
    return this.sent.has(url);
  }

  async markSent(url, info) {
    this.sent.set(url, info);
  }
}

export class FakePublisher {
  constructor({ failFor = [] } = {}) {
    this.published = [];
    this.failFor = failFor;
  }

  async publish(record) {
    if (this.failFor.includes(record.article.url)) throw new Error('HTTP 500');
    this.published.push(record);
    return { status: 201 };
  }
}
