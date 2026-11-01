// Server CDP tiruan (Bun.serve + WebSocket) untuk menguji CdpClient dan CdpDriver tanpa Chrome.

export const NO_REPLY = Symbol('no reply');

/**
 * `handlers[method](params, ctx)` mengembalikan `result`, `{ error }`, atau `NO_REPLY`.
 * `ctx.emit(method, params)` mengirim event ke session request tersebut.
 */
export function startFakeCdp(handlers = {}) {
  const calls = [];
  const sockets = new Set();
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) {
      return srv.upgrade(req) ? undefined : new Response('upgrade required', { status: 426 });
    },
    websocket: {
      open: (ws) => sockets.add(ws),
      close: (ws) => sockets.delete(ws),
      async message(ws, data) {
        const msg = JSON.parse(data);
        calls.push(msg);
        const emit = (method, params) => ws.send(JSON.stringify({ method, params, sessionId: msg.sessionId }));
        const handler = handlers[msg.method] ?? (() => ({}));
        const out = await handler(msg.params, { emit, msg });
        if (out === NO_REPLY) return;
        ws.send(JSON.stringify(out?.error ? { id: msg.id, error: out.error } : { id: msg.id, result: out ?? {} }));
      },
    },
  });
  return {
    url: `ws://127.0.0.1:${server.port}`,
    calls,
    methods: () => calls.map((c) => c.method),
    dropConnections: () => sockets.forEach((ws) => ws.close()),
    stop: () => server.stop(true),
  };
}

/** Handler standar sebuah tab: navigasi memicu DOMContentLoaded dengan `loaderId` yang sesuai. */
export function tabHandlers({ evaluate = () => ({ result: { value: null } }), navigate } = {}) {
  let n = 0;
  return {
    'Target.createTarget': () => ({ targetId: 'T1' }),
    'Target.attachToTarget': () => ({ sessionId: 'S1' }),
    'Page.navigate':
      navigate ??
      ((params, { emit }) => {
        const loaderId = `L${++n}`;
        setTimeout(() => emit('Page.lifecycleEvent', { name: 'DOMContentLoaded', loaderId, frameId: 'F1' }), 5);
        return { frameId: 'F1', loaderId };
      }),
    'Runtime.evaluate': (params) => evaluate(params.expression),
  };
}
