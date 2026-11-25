export function normalizeHeaders(h, ignore) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    const lk = k.toLowerCase();
    if (ignore.has(lk)) continue;
    out[lk] = Array.isArray(v) ? v.join(',') : String(v);
  }
  return out;
}

export function bodyShape(body, depth = 3) {
  if (body == null) return 'null';
  try {
    const v = typeof body === 'string' ? JSON.parse(body) : body;
    return shape(v, depth);
  } catch {
    return { _type: 'text', length: (typeof body === 'string' ? body : '').length };
  }
}

function shape(v, d) {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    if (d <= 0) return 'array';
    return ['array', v.length ? shape(v[0], d - 1) : 'empty'];
  }
  if (typeof v === 'object') {
    if (d <= 0) return 'object';
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = shape(v[k], d - 1);
    return o;
  }
  return typeof v;
}
