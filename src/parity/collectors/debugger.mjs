import fs from 'node:fs';
import path from 'node:path';

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function buildGroupTree(snapshotSpans) {
  if (!snapshotSpans) return [];
  const nodes = new Map();
  const order = [];
  for (const s of snapshotSpans) {
    if (s.phase === 'start' && s.kind === 'group') {
      const node = { name: s.name, spanId: s.spanId, parent: s.parent, children: [] };
      nodes.set(s.spanId, node);
      order.push(s.spanId);
    }
  }
  const roots = [];
  for (const id of order) {
    const n = nodes.get(id);
    const parent = n.parent ? nodes.get(n.parent) : null;
    if (parent) parent.children.push({ name: n.name, children: n.children });
    else roots.push({ name: n.name, children: n.children });
  }
  return roots;
}

export async function collectDebugger(dir) {
  const timeline = readJsonl(path.join(dir, 'timeline.jsonl'));

  const snapshotFile = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.startsWith('snapshot-') && f.endsWith('.json')).sort().pop()
    : null;
  const snapshot = snapshotFile ? readJson(path.join(dir, snapshotFile), null) : null;

  const requests = (snapshot?.requests || timeline).map((r) => ({
    method: r.method,
    url: r.url,
    status: r.response?.status ?? r.status ?? null,
    response: {
      status: r.response?.status ?? r.status ?? null,
      headers: r.response?.headers ?? null,
      body: r.response?.body ?? null,
    },
    timings: r.timings || (r.totalMs != null ? { totalMs: r.totalMs } : null),
  }));

  const checks = (snapshot?.checks || []).map((c) => ({ name: c.name, pass: !!c.pass }));
  const groupTree = buildGroupTree(snapshot?.spans);

  return {
    requests,
    checks,
    groupTree,
    threwError: !!snapshot?.error,
    unsupported: [],
  };
}
