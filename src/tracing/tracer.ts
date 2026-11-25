import fs from 'node:fs';
import path from 'node:path';
import { config } from '../lib/config.js';
import { EVENTS } from '../lib/obs-bus.js';
import { Span } from './spans.js';
import { pushSpan, popSpan, currentSpanId } from './context.js';
import { buildTree, toAscii, toMermaid } from './graph-builder.js';

function shortUrl(u) {
  try { return new URL(u).pathname; } catch { return u; }
}

export function attach(bus) {
  const spans = new Map();
  const roots = [];

  globalThis.__trace = { spans, roots, dump: () => console.log(toAscii(roots)) };

  bus.on(EVENTS.SPAN_START, (e) => {
    const parent = e.parent ?? currentSpanId();
    const s = new Span({ id: e.spanId, parent, kind: e.kind, name: e.name, startTs: e.ts });
    spans.set(e.spanId, s);
    const parentSpan = parent ? spans.get(parent) : null;
    if (parentSpan) parentSpan.children.push(s);
    else roots.push(s);
    pushSpan(e.spanId);
  });

  bus.on(EVENTS.SPAN_END, (e) => {
    const s = spans.get(e.spanId);
    if (s) s.end(e.ts);
    popSpan();
  });

  bus.on(EVENTS.HTTP_START, (e) => {
    const parent = currentSpanId();
    const s = new Span({
      id: e.requestId,
      parent,
      kind: 'http',
      name: `${e.method} ${shortUrl(e.url)}`,
      attrs: { 'http.method': e.method, 'http.url': e.url },
      startTs: e.ts,
    });
    spans.set(e.requestId, s);
    const parentSpan = parent ? spans.get(parent) : null;
    if (parentSpan) parentSpan.children.push(s);
    else roots.push(s);
  });

  bus.on(EVENTS.HTTP_END, (e) => {
    const s = spans.get(e.requestId);
    if (!s) return;
    s.attrs['http.status_code'] = e.status;
    if (e.error) s.attrs['http.error'] = e.error;
    const status = e.error || e.status >= 400 || e.status === 0 ? 'ERROR' : 'OK';
    s.end(e.ts, status);
  });

  bus.on(EVENTS.CHECK, (e) => {
    const id = currentSpanId();
    const s = id ? spans.get(id) : null;
    s?.addEvent({ name: 'check', label: e.name, pass: e.pass, error: e.error, ts: e.ts });
  });

  bus.on(EVENTS.SLEEP, (e) => {
    const id = currentSpanId();
    const s = id ? spans.get(id) : null;
    s?.addEvent({ name: 'sleep', seconds: e.seconds, skipped: e.skipped, ts: e.ts });
  });

  return async function flush() {
    const tree = buildTree(roots);
    fs.mkdirSync(config.outDir, { recursive: true });
    fs.writeFileSync(path.join(config.outDir, 'trace.json'), JSON.stringify(tree, null, 2));
    if (process.env.K6_DEBUG_TRACE_PRINT === '1') {
      console.log('── execution graph ──');
      console.log(toAscii(roots));
    }
    if (process.env.K6_DEBUG_TRACE_MERMAID === '1') {
      fs.writeFileSync(path.join(config.outDir, 'trace.mmd'), toMermaid(roots));
    }
    if (process.env.K6_DEBUG_TRACE_OTLP) {
      const { exportOtlp } = await import('./exporters/otlp.js');
      try {
        await exportOtlp(tree, process.env.K6_DEBUG_TRACE_OTLP, bus.sessionId);
      } catch (e) {
        console.warn(`[k6-debugger] OTLP export failed: ${e.message}`);
      }
    }
  };
}
