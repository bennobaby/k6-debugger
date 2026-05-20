import { config } from '../lib/config.mjs';
import { bus, EVENTS } from '../lib/obs-bus.mjs';

const groupStack = [];

export function group(name, fn) {
  const spanId = bus.newId('span');
  const parent = groupStack[groupStack.length - 1]?.spanId ?? null;
  groupStack.push({ name, spanId });
  const indent = '  '.repeat(groupStack.length - 1);
  console.log(`${indent}▶ group: ${name}`);
  const start = Date.now();
  bus.emit(EVENTS.SPAN_START, { spanId, parent, kind: 'group', name, ts: start });

  const finish = () => {
    const end = Date.now();
    const ms = end - start;
    console.log(`${indent}◀ group end: ${name} (${ms}ms)`);
    bus.emit(EVENTS.SPAN_END, { spanId, ts: end, durationMs: ms });
    groupStack.pop();
  };

  let result;
  try {
    result = fn();
  } catch (e) {
    finish();
    throw e;
  }
  // Defer span-end until an async body settles so timing/nesting stay accurate.
  if (result && typeof result.then === 'function') {
    return result.then(
      (v) => { finish(); return v; },
      (e) => { finish(); throw e; },
    );
  }
  finish();
  return result;
}

export function sleep(seconds) {
  bus.emit(EVENTS.SLEEP, { seconds, ts: Date.now(), skipped: !!config.noSleep });
  if (config.noSleep) return;
  const ms = Math.max(0, Math.floor(Number(seconds) * 1000));
  if (ms === 0) return;
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  Atomics.wait(view, 0, 0, ms);
}

export function check(value, conditions, tags) {
  let allPass = true;
  for (const [name, predicate] of Object.entries(conditions || {})) {
    let pass = false;
    let err = null;
    try {
      pass = !!predicate(value);
    } catch (e) {
      pass = false;
      err = e?.message || String(e);
    }
    bus.emit(EVENTS.CHECK, { name, pass, error: err, tags: tags || null, ts: Date.now() });
    if (!pass) {
      allPass = false;
      console.warn(`  ✖ check failed: ${name}`);
    }
  }
  return allPass;
}

export function fail(message) {
  throw new Error(`k6 fail(): ${message ?? ''}`);
}

// Seeded PRNG so randomSeed() makes Math.random() deterministic across runs,
// matching k6's randomSeed() behavior (needed for deterministic replay).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _seed = null;
export function randomSeed(s) {
  _seed = Number(s) >>> 0;
  Math.random = mulberry32(_seed);
}
export function _getRandomSeed() { return _seed; }
