import { buildResponse } from '../lib/response.js';
import { bus, EVENTS } from '../lib/obs-bus.js';

export class ReplayIndex {
  constructor(snapshot) {
    this.snapshot = snapshot;
    this.byKey = new Map();
    for (const r of snapshot.requests || []) {
      const key = `${(r.method || '').toUpperCase()} ${r.url}`;
      const bucket = this.byKey.get(key) || [];
      bucket.push(r);
      this.byKey.set(key, bucket);
    }
    this.cursor = new Map();
  }

  next(method, url) {
    const key = `${method.toUpperCase()} ${url}`;
    const bucket = this.byKey.get(key);
    if (!bucket || !bucket.length) return null;
    const i = this.cursor.get(key) || 0;
    if (i >= bucket.length) return null;
    this.cursor.set(key, i + 1);
    return bucket[i];
  }
}

function waitForStep(method, url) {
  console.log(`[k6-debugger:step] paused before ${method} ${url} — set globalThis.__replayContinue=true to proceed`);
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  const start = Date.now();
  while (!globalThis.__replayContinue) {
    Atomics.wait(view, 0, 0, 100);
    if (Date.now() - start > 5 * 60 * 1000) {
      console.warn('[k6-debugger:step] timeout — continuing');
      break;
    }
  }
  globalThis.__replayContinue = false;
}

export function makeReplayCurl({ index, mode, liveFallback }) {
  return function replayCurl(method, url, body, params = {}) {
    const requestId = bus.newId('req');
    const startTs = Date.now();
    bus.emit(EVENTS.HTTP_START, {
      requestId, method: method.toUpperCase(), url,
      headers: params.headers || {}, body, ts: startTs,
    });

    if (mode === 'step') waitForStep(method, url);

    const rec = index.next(method, url);
    if (!rec) {
      if (mode === 'live' && liveFallback) {
        return liveFallback(method, url, body, params);
      }
      const err = `[k6-debugger] no snapshot match for ${method} ${url}`;
      bus.emit(EVENTS.HTTP_TIMING, { requestId, dnsMs: 0, connectMs: 0, tlsMs: 0, sendMs: 0, waitMs: 0, downloadMs: 0, totalMs: 0, redirects: 0, bytes: 0, ts: Date.now() });
      bus.emit(EVENTS.HTTP_END, { requestId, status: 0, durationMs: 0, error: err, errorCode: 1, responseBody: '', responseHeaders: {}, ts: Date.now() });
      throw new Error(err);
    }

    const response = rec.response || {};
    const timings = rec.timings || {};
    const total = timings.totalMs ?? 0;

    bus.emit(EVENTS.HTTP_TIMING, {
      requestId,
      dnsMs: timings.dnsMs ?? 0,
      connectMs: timings.connectMs ?? 0,
      tlsMs: timings.tlsMs ?? 0,
      sendMs: timings.sendMs ?? 0,
      waitMs: timings.waitMs ?? 0,
      downloadMs: timings.downloadMs ?? 0,
      totalMs: total,
      redirects: timings.redirects ?? 0,
      bytes: timings.bytes ?? 0,
      ts: Date.now(),
    });

    const built = buildResponse({
      method, url, body, params,
      status: response.status ?? 0,
      bodyText: response.body ?? '',
      headers: response.headers ?? {},
      durationMs: total,
      error: response.error || '',
      error_code: response.errorCode || (response.error ? 1 : 0),
    });

    bus.emit(EVENTS.HTTP_END, {
      requestId, status: response.status ?? 0, durationMs: total,
      error: response.error || '', errorCode: response.errorCode || 0,
      responseBody: response.body ?? '', responseHeaders: response.headers ?? {},
      ts: Date.now(),
    });

    return built;
  };
}
