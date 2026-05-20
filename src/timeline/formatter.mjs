export function formatWaterfall(items) {
  if (!items.length) return '';
  const t0 = Math.min(...items.map((i) => i.startTs ?? 0));
  const end = Math.max(...items.map((i) => (i.startTs ?? 0) + (i.totalMs ?? 0)));
  const span = Math.max(1, end - t0);
  const width = 60;
  const lines = ['── timeline ──'];
  for (const i of items) {
    const startOff = Math.floor((((i.startTs ?? t0) - t0) / span) * width);
    const len = Math.max(1, Math.floor(((i.totalMs ?? 0) / span) * width));
    const bar = ' '.repeat(startOff) + '█'.repeat(Math.min(len, width - startOff));
    const tag = `${i.status ?? 'ERR'} ${i.totalMs ?? 0}ms`;
    lines.push(`${bar.padEnd(width)} ${(i.method || '').padEnd(6)} ${i.url}  ${tag}`);
  }
  return lines.join('\n');
}

export function toDevtoolsJson(items) {
  return items.map((i) => ({
    requestId: i.requestId,
    url: i.url,
    method: i.method,
    startTime: i.startTs,
    endTime: i.endTs,
    timing: {
      dns: i.dnsMs ?? 0,
      connect: i.connectMs ?? 0,
      ssl: i.tlsMs ?? 0,
      send: i.sendMs ?? 0,
      wait: i.waitMs ?? 0,
      receive: i.downloadMs ?? 0,
      total: i.totalMs ?? 0,
    },
    status: i.status,
    redirects: i.redirects ?? 0,
    bytes: i.bytes ?? 0,
    error: i.error,
  }));
}
