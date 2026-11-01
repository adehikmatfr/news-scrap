#!/usr/bin/env bun
// Penerima tiruan untuk uji coba: menerima POST/PATCH/PUT berisi JSON,
// mencetak ringkasannya, dan menyimpan payload ke data/received.jsonl.
//
//   bun tools/mock-receiver.js [port]

const port = Number(Bun.argv[2] ?? 8080);
const outFile = Bun.fileURLToPath(new URL('../data/received.jsonl', import.meta.url));

// Alat uji bervolume kecil: cukup baca lalu tulis ulang seluruh file (Bun.write membuat folder induk).
async function appendLine(line) {
  const file = Bun.file(outFile);
  const existing = (await file.exists()) ? await file.text() : '';
  await Bun.write(outFile, `${existing}${line}\n`);
}

Bun.serve({
  port,
  async fetch(req) {
    if (!['POST', 'PATCH', 'PUT'].includes(req.method)) return new Response(null, { status: 405 });

    let payload;
    try {
      payload = await req.json();
    } catch {
      return new Response('invalid json', { status: 400 });
    }
    await appendLine(JSON.stringify(payload));

    const a = payload.article ?? {};
    console.log(`${req.method} ${new URL(req.url).pathname} key=${req.headers.get('idempotency-key')}`);
    console.log(`  ${a.title}  |  ${a.published_at}  |  ${a.word_count} kata  |  ${a.page_count} halaman  |  ${a.images?.length ?? 0} gambar`);
    return Response.json({ ok: true, id: payload.id }, { status: req.method === 'POST' ? 201 : 200 });
  },
});
console.log(`mock receiver listening on http://localhost:${port}`);
