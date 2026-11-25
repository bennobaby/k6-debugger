import fs from 'node:fs';
import path from 'node:path';
import { config } from '../lib/config.js';
import { EVENTS } from '../lib/obs-bus.js';
import { makeSnapshot } from './schema.js';

const REDACT_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-api-key', 'proxy-authorization',
]);

function redactHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    out[k] = REDACT_HEADERS.has(k.toLowerCase()) ? '***REDACTED***' : v;
  }
  return out;
}

function truncate(text, limit) {
  if (!limit || !text) return text;
  return text.length > limit ? text.slice(0, limit) + `…[truncated ${text.length - limit}b]` : text;
}

function pickEnv(keys) {
  const out = {};
  for (const k of keys) if (k in process.env) out[k] = process.env[k];
  return out;
}

export function attach(bus, mode) {
  if (mode !== 'record') return null;

  const requests = new Map();
  const order = [];
  const spans = [];
  const checks = [];
  let scriptError = null;

  bus.on(EVENTS.SCRIPT_ERROR, (e) => {
    scriptError = e?.message || String(e);
  });

  bus.on(EVENTS.HTTP_START, (e) => {
    if (!requests.has(e.requestId)) order.push(e.requestId);
    requests.set(e.requestId, {
      requestId: e.requestId,
      method: e.method,
      url: e.url,
      headers: redactHeaders(e.headers),
      body: e.body == null ? null : truncate(
        typeof e.body === 'string' ? e.body : JSON.stringify(e.body),
        config.bodyTruncateBytes,
      ),
      startTs: e.ts,
      timings: null,
      response: null,
    });
  });

  bus.on(EVENTS.HTTP_TIMING, (e) => {
    const r = requests.get(e.requestId);
    if (!r) return;
    r.timings = {
      dnsMs: e.dnsMs, connectMs: e.connectMs, tlsMs: e.tlsMs,
      sendMs: e.sendMs, waitMs: e.waitMs, downloadMs: e.downloadMs,
      totalMs: e.totalMs, redirects: e.redirects, bytes: e.bytes,
    };
  });

  bus.on(EVENTS.HTTP_END, (e) => {
    const r = requests.get(e.requestId);
    if (!r) return;
    r.response = {
      status: e.status,
      error: e.error || null,
      errorCode: e.errorCode || 0,
      body: truncate(e.responseBody || '', config.bodyTruncateBytes),
      headers: redactHeaders(e.responseHeaders),
      endTs: e.ts,
    };
  });

  bus.on(EVENTS.SPAN_START, (e) => spans.push({ phase: 'start', ...e }));
  bus.on(EVENTS.SPAN_END, (e) => spans.push({ phase: 'end', ...e }));
  bus.on(EVENTS.CHECK, (e) => checks.push(e));

  return async function flush() {
    const snap = makeSnapshot({
      sessionId: bus.sessionId,
      target: process.argv[2] || process.env.K6_DEBUG_TARGET || null,
      env: pickEnv(['PROJECT', 'ENVIRONMENT', 'DEBUG_NO_SLEEP', 'K6_DEBUG_HTTP']),
      authToken: process.env.AUTH_TOKEN ? '***REDACTED***' : null,
      requests: order.map((id) => requests.get(id)).filter(Boolean),
      spans,
      checks,
      error: scriptError,
    });
    fs.mkdirSync(config.outDir, { recursive: true });
    const file = path.join(config.outDir, `snapshot-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(snap, null, 2));
    console.log(`[k6-debugger] snapshot saved: ${file}`);
  };
}
