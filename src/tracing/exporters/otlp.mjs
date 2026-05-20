import crypto from 'node:crypto';

function traceIdFromSession(sessionId) {
  return crypto.createHash('sha1').update(sessionId).digest('hex').slice(0, 32);
}

// OTLP/JSON requires spanId = 16 hex chars (8 bytes). Our internal ids look like
// "req_ab12cd34" — not valid hex — so collectors reject them. Hash to 16 hex.
function spanIdFrom(id) {
  if (!id) return '';
  return crypto.createHash('sha1').update(String(id)).digest('hex').slice(0, 16);
}

function toOtlpSpan(s, traceId) {
  const ns = (ms) => (BigInt(ms || 0) * 1_000_000n).toString();
  return {
    traceId,
    spanId: spanIdFrom(s.id),
    parentSpanId: spanIdFrom(s.parent),
    name: s.name,
    kind: s.kind === 'http' ? 3 : 1,
    startTimeUnixNano: ns(s.startTs),
    endTimeUnixNano: ns(s.endTs ?? s.startTs),
    status: { code: s.status === 'ERROR' ? 2 : 1 },
    attributes: Object.entries(s.attrs || {}).map(([k, v]) => ({
      key: k,
      value: { stringValue: String(v) },
    })),
    events: (s.events || []).map((e) => ({
      timeUnixNano: ns(e.ts),
      name: e.name,
      attributes: Object.entries(e)
        .filter(([k]) => k !== 'name' && k !== 'ts')
        .map(([k, v]) => ({ key: k, value: { stringValue: String(v) } })),
    })),
  };
}

function flatten(roots) {
  const out = [];
  const walk = (s) => { out.push(s); s.children.forEach(walk); };
  roots.forEach(walk);
  return out;
}

export async function exportOtlp(rootsTree, endpoint, sessionId) {
  const traceId = traceIdFromSession(sessionId);
  const spans = flatten(rootsTree).map((s) => toOtlpSpan(s, traceId));
  const payload = {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'k6-debugger' } },
          { key: 'session.id', value: { stringValue: sessionId } },
        ],
      },
      scopeSpans: [{ scope: { name: 'k6-debugger.tracer' }, spans }],
    }],
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`OTLP export failed: ${res.status} ${res.statusText}`);
}
