import test from 'node:test';
import assert from 'node:assert/strict';

import { bus, EVENTS } from '../src/lib/obs-bus.mjs';
import { TimelineStore } from '../src/timeline/storage.mjs';
import { formatWaterfall, toDevtoolsJson } from '../src/timeline/formatter.mjs';
import { Span } from '../src/tracing/spans.mjs';
import { buildTree, toAscii, toMermaid } from '../src/tracing/graph-builder.mjs';
import { ReplayIndex, makeReplayCurl } from '../src/replay/replayer.mjs';
import { makeSnapshot, SNAPSHOT_VERSION } from '../src/replay/schema.mjs';
import { normalizeHeaders, bodyShape } from '../src/parity/normalize.mjs';
import { compareRuns } from '../src/parity/compare.mjs';

test('obs-bus: newId is unique + prefixed', () => {
  const a = bus.newId('req');
  const b = bus.newId('req');
  assert.match(a, /^req_[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});

test('obs-bus: events are synchronous', () => {
  let seen = null;
  const handler = (e) => { seen = e; };
  bus.on(EVENTS.CHECK, handler);
  bus.emit(EVENTS.CHECK, { name: 'x', pass: true });
  assert.deepEqual(seen, { name: 'x', pass: true });
  bus.off(EVENTS.CHECK, handler);
});

test('timeline store: upsert merges by id', () => {
  const s = new TimelineStore();
  s.upsert('r1', { method: 'GET', url: 'http://a', startTs: 100 });
  s.upsert('r1', { status: 200, totalMs: 50 });
  const all = s.all();
  assert.equal(all.length, 1);
  assert.equal(all[0].status, 200);
  assert.equal(all[0].method, 'GET');
});

test('timeline formatter: waterfall + devtools json', () => {
  const items = [{ requestId: 'r1', method: 'GET', url: 'http://a', startTs: 0, totalMs: 100, status: 200 }];
  assert.match(formatWaterfall(items), /GET/);
  const dt = toDevtoolsJson(items);
  assert.equal(dt[0].timing.total, 100);
  assert.equal(dt[0].status, 200);
});

test('tracing: buildTree + ascii + mermaid', () => {
  const root = new Span({ id: 's1', parent: null, kind: 'group', name: 'login', startTs: 0 });
  const child = new Span({ id: 'r1', parent: 's1', kind: 'http', name: 'POST /auth', startTs: 1 });
  child.end(5, 'OK');
  root.children.push(child);
  root.end(6, 'OK');
  const tree = buildTree([root]);
  assert.equal(tree[0].children[0].name, 'POST /auth');
  assert.match(toAscii([root]), /login/);
  assert.match(toAscii([root]), /POST \/auth/);
  assert.match(toMermaid([root]), /graph TD/);
});

test('replay index: FIFO per key then misses when exhausted', () => {
  const snap = makeSnapshot({
    requests: [
      { method: 'GET', url: 'http://a', response: { status: 1 } },
      { method: 'GET', url: 'http://a', response: { status: 2 } },
    ],
  });
  assert.equal(snap.version, SNAPSHOT_VERSION);
  const idx = new ReplayIndex(snap);
  assert.equal(idx.next('GET', 'http://a').response.status, 1);
  assert.equal(idx.next('GET', 'http://a').response.status, 2);
  assert.equal(idx.next('GET', 'http://a'), null, 'exhausted -> miss, no stale replay');
  assert.equal(idx.next('GET', 'http://missing'), null);
});

test('replay: mock curl returns snapshot response', () => {
  const snap = makeSnapshot({
    requests: [{ method: 'GET', url: 'http://a', response: { status: 200, body: '{"ok":true}' }, timings: { totalMs: 7 } }],
  });
  const curl = makeReplayCurl({ index: new ReplayIndex(snap), mode: 'mock' });
  const res = curl('GET', 'http://a');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json(), { ok: true });
  assert.equal(res.timings.duration, 7);
});

test('replay: mock throws on miss', () => {
  const curl = makeReplayCurl({ index: new ReplayIndex(makeSnapshot({ requests: [] })), mode: 'mock' });
  assert.throws(() => curl('GET', 'http://x'), /no snapshot match/);
});

test('parity normalize: ignores volatile headers, lowercases', () => {
  const out = normalizeHeaders({ Date: 'x', 'Content-Type': 'application/json' }, new Set(['date']));
  assert.deepEqual(out, { 'content-type': 'application/json' });
});

test('parity normalize: bodyShape collapses values to types', () => {
  assert.deepEqual(bodyShape('{"id":1,"name":"a"}'), { id: 'number', name: 'string' });
  assert.deepEqual(bodyShape('not json'), { _type: 'text', length: 8 });
});

test('parity compare: identical runs => PASS', () => {
  const run = {
    requests: [{ method: 'GET', url: 'http://a', status: 200, response: { status: 200, headers: {}, body: '{"id":1}' }, timings: { totalMs: 10 } }],
    checks: [{ name: 'ok', pass: true }],
    groupTree: [{ name: 'g', children: [] }],
    threwError: false,
  };
  const report = compareRuns(run, JSON.parse(JSON.stringify(run)));
  assert.equal(report.verdict, 'PASS');
});

test('parity compare: status mismatch => FAIL', () => {
  const a = {
    requests: [{ method: 'GET', url: 'http://a', status: 200, response: { status: 200, headers: {}, body: '{}' }, timings: { totalMs: 10 } }],
    checks: [], groupTree: [], threwError: false,
  };
  const b = JSON.parse(JSON.stringify(a));
  b.requests[0].status = 500;
  b.requests[0].response.status = 500;
  const report = compareRuns(a, b);
  assert.equal(report.verdict, 'FAIL');
  assert.ok(report.findings.some((f) => f.area === 'http.status' && f.level === 'fail'));
});
