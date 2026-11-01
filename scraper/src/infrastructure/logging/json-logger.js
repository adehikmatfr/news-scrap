// Implementasi port Logger: satu baris JSON per log (mudah dibaca journald, Docker, Loki, dll.).

export function createJsonLogger(write = (line) => console.log(line)) {
  const log = (level) => (msg, fields = {}) =>
    write(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }));
  return { info: log('info'), warn: log('warn'), error: log('error') };
}
