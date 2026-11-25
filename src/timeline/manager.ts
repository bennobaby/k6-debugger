import fs from 'node:fs';
import path from 'node:path';
import { config } from '../lib/config.js';
import { EVENTS } from '../lib/obs-bus.js';
import { TimelineStore } from './storage.js';
import { formatWaterfall, toDevtoolsJson } from './formatter.js';

export function attach(bus) {
  const store = new TimelineStore({
    outFile: path.join(config.outDir, 'timeline.jsonl'),
  });

  globalThis.__timeline = { store, dump: () => console.log(formatWaterfall(store.all())) };

  bus.on(EVENTS.HTTP_START, (e) => {
    store.upsert(e.requestId, {
      method: e.method, url: e.url, headers: e.headers || {}, startTs: e.ts,
    });
  });

  bus.on(EVENTS.HTTP_TIMING, (e) => {
    store.upsert(e.requestId, {
      dnsMs: e.dnsMs, connectMs: e.connectMs, tlsMs: e.tlsMs,
      sendMs: e.sendMs, waitMs: e.waitMs, downloadMs: e.downloadMs,
      totalMs: e.totalMs, redirects: e.redirects, bytes: e.bytes,
    });
  });

  bus.on(EVENTS.HTTP_END, (e) => {
    store.upsert(e.requestId, { status: e.status, error: e.error || null, endTs: e.ts });
  });

  return async function flush() {
    store.persist();
    const items = store.all();
    if (process.env.K6_DEBUG_TIMELINE_PRINT === '1') {
      console.log(formatWaterfall(items));
    }
    const devtoolsFile = path.join(config.outDir, 'timeline.json');
    fs.mkdirSync(path.dirname(devtoolsFile), { recursive: true });
    fs.writeFileSync(devtoolsFile, JSON.stringify(toDevtoolsJson(items), null, 2));
  };
}
