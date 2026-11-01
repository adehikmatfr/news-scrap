// Endpoint status (Bun.serve): GET /health untuk health check, GET /status untuk kondisi setiap sumber.

export class StatusServer {
  /**
   * @param {object} options
   * @param {string} options.host
   * @param {number} options.port            0 = port acak (dipakai test)
   * @param {() => object} options.getStatus
   * @param {() => boolean} options.isHealthy
   * @param {() => Date} [options.clock]
   */
  constructor({ host, port, getStatus, isHealthy, clock = () => new Date() }) {
    Object.assign(this, { host, port, getStatus, isHealthy, clock });
    this.startedAt = clock();
  }

  start() {
    this.server = Bun.serve({ hostname: this.host, port: this.port, fetch: (req) => this.#handle(req) });
    return this;
  }

  get url() {
    return this.server?.url.href;
  }

  async stop() {
    await this.server?.stop(true);
  }

  #handle(req) {
    if (req.method !== 'GET') return new Response(null, { status: 405 });
    const { pathname } = new URL(req.url);

    if (pathname === '/health') {
      const uptimeSeconds = Math.round((this.clock() - this.startedAt) / 1000);
      return this.isHealthy()
        ? Response.json({ status: 'ok', uptimeSeconds })
        : Response.json({ status: 'stopping', uptimeSeconds }, { status: 503 });
    }
    if (pathname === '/status') return Response.json(this.getStatus());
    return Response.json({ error: 'not found' }, { status: 404 });
  }
}
