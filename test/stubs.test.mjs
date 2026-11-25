import test from 'node:test';
import assert from 'node:assert/strict';
import '../dist/preload.js';

import http from '../dist/stubs/k6-http.js';
import { b64decode, b64encode } from '../dist/stubs/k6-encoding.js';
import { SharedArray } from '../dist/stubs/k6-data.js';
import { group, check, fail, randomSeed, _getRandomSeed } from '../dist/stubs/k6.js';
import { Counter, Gauge, Rate, Trend } from '../dist/stubs/k6-metrics.js';
import execDefault, { vu, scenario, instance, test as k6test } from '../dist/stubs/k6-execution.js';
import { parseHeaderBlock } from '../dist/lib/headers.js';
import { buildResponse } from '../dist/lib/response.js';
import { config } from '../dist/lib/config.js';

test('k6/encoding: b64decode std', () => {
  assert.equal(b64decode('aGVsbG8='), 'hello');
});

test('k6/encoding: b64decode rawurl pads correctly', () => {
  assert.equal(b64decode('aGVsbG8', 'rawurl'), 'hello');
});

test('k6/encoding: b64encode std', () => {
  assert.equal(b64encode('hello'), 'aGVsbG8=');
});

test('k6/encoding: b64encode rawurl strips padding', () => {
  assert.equal(b64encode('hello', 'rawurl'), 'aGVsbG8');
});

test('k6/data: SharedArray length + index + iterator', () => {
  const arr = new SharedArray('t', () => [10, 20, 30]);
  assert.equal(arr.length, 3);
  assert.equal(arr[1], 20);
  assert.deepEqual([...arr], [10, 20, 30]);
});

test('k6/data: SharedArray silently rejects writes', () => {
  const arr = new SharedArray('t', () => [1]);
  arr[0] = 99;
  assert.equal(arr[0], 1, 'value must remain unchanged after write attempt');
});

test('k6: check returns true when all pass', () => {
  const ok = check({ x: 1 }, { 'has x': (v) => v.x === 1 });
  assert.equal(ok, true);
});

test('k6: check returns false when any fail', () => {
  const ok = check({ x: 1 }, { 'has y': (v) => v.y === 2 });
  assert.equal(ok, false);
});

test('k6: check swallows predicate throws', () => {
  const ok = check(null, { 'deref': (v) => v.nope.deep });
  assert.equal(ok, false);
});

test('k6: fail throws', () => {
  assert.throws(() => fail('boom'), /k6 fail\(\): boom/);
});

test('k6: group returns inner fn value', () => {
  const v = group('g', () => 42);
  assert.equal(v, 42);
});

test('k6: group pops stack even on throw', () => {
  assert.throws(() => group('g', () => { throw new Error('x'); }));
  const v = group('g2', () => 'ok');
  assert.equal(v, 'ok');
});

test('k6: randomSeed stored', () => {
  randomSeed(123);
  assert.equal(_getRandomSeed(), 123);
});

test('k6/http: file() is branded for multipart detection', () => {
  const f = http.file('hi', 'a.txt', 'text/plain');
  assert.equal(f.__k6File, true);
  assert.equal(f.filename, 'a.txt');
  assert.equal(f.content_type, 'text/plain');
  assert.equal(f.data, 'hi');
});

test('k6/http: cookieJar set + cookiesForURL round-trip, no cross-host leak', () => {
  const jar = http.cookieJar();
  jar.set('https://ex.test/path', 'sid', 'abc123');
  assert.equal(jar.cookiesForURL('https://ex.test/path/sub').sid, 'abc123');
  assert.deepEqual(jar.cookiesForURL('https://other.test/'), {});
});

test('k6/http: url`` template tag joins values', () => {
  assert.equal(http.url`https://x/${1}/y/${'z'}`, 'https://x/1/y/z');
});

test('k6/metrics: stubs accept add() without throw', () => {
  for (const M of [Counter, Gauge, Rate, Trend]) {
    const m = new M('x');
    assert.doesNotThrow(() => m.add(1, { tag: 'v' }));
  }
});

test('k6/execution: named + default exports match', () => {
  assert.equal(execDefault.vu, vu);
  assert.equal(execDefault.scenario, scenario);
  assert.equal(execDefault.instance, instance);
  assert.equal(execDefault.test, k6test);
});

test('k6/execution: test.abort throws with code', () => {
  assert.throws(() => k6test.abort('stop'), /test\.abort\(\): stop/);
});

test('headers: parseHeaderBlock handles redirect chains', () => {
  const raw = 'HTTP/1.1 301 Moved\r\nLocation: /new\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Trace: abc\r\n';
  const { headers, statusLine } = parseHeaderBlock(raw);
  assert.equal(statusLine, 'HTTP/1.1 200 OK');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers['X-Trace'], 'abc');
});

test('headers: parseHeaderBlock empty input', () => {
  assert.deepEqual(parseHeaderBlock(''), { headers: {}, statusLine: '' });
});

test('headers: parseHeaderBlock ignores malformed lines', () => {
  const raw = 'HTTP/1.1 200 OK\r\nValid: yes\r\nnoColonHere\r\n: emptyName\r\n';
  const { headers } = parseHeaderBlock(raw);
  assert.equal(headers.Valid, 'yes');
  assert.equal(Object.keys(headers).length, 1);
});

test('response: builds k6 shape with timings', () => {
  const r = buildResponse({
    method: 'GET', url: 'http://x', body: null, params: {},
    status: 200, bodyText: '{"a":1}', headers: { 'X': 'y' }, durationMs: 50,
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers.X, 'y');
  assert.equal(r.timings.duration, 50);
  assert.deepEqual(r.json(), { a: 1 });
  assert.equal(r.json('a'), 1);
  assert.equal(r.error, '');
});

test('response: json() returns null on invalid body', () => {
  const r = buildResponse({
    method: 'GET', url: 'http://x', body: null, params: {},
    status: 500, bodyText: 'not json', headers: {}, durationMs: 1,
  });
  assert.equal(r.json(), null);
});

test('config: reads env at module load', () => {
  assert.equal(typeof config.curlMaxBuffer, 'number');
  assert.ok(config.curlMaxBuffer > 0);
  assert.equal(typeof config.features.timeline, 'boolean');
});

test('preload: __ENV reads process.env', () => {
  process.env.K6_DEBUG_TEST_VAR = 'xyz';
  assert.equal(globalThis.__ENV.K6_DEBUG_TEST_VAR, 'xyz');
  delete process.env.K6_DEBUG_TEST_VAR;
});

test('preload: open reads file contents', () => {
  const url = new URL('../dist/preload.js', import.meta.url);
  const content = globalThis.open(url.href);
  assert.ok(content.includes('globalThis.__ENV'));
});
