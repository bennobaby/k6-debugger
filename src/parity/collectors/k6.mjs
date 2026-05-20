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

// k6 JSON output (--out json=) emits Point/Metric records.
// Reconstruct per-request rows from http_req_* metrics correlated by iter/vu/url.
function reconstructRequests(points) {
  const byKey = new Map();
  for (const p of points) {
    if (p.type !== 'Point') continue;
    const tags = p.data?.tags || {};
    const url = tags.url || tags.name;
    const method = tags.method;
    if (!url || !method) continue;
    const key = `${tags.iter ?? 0}|${tags.vu ?? 0}|${tags.scenario ?? ''}|${method}|${url}|${tags.group ?? ''}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        method, url,
        group: tags.group || null,
        status: tags.status ? parseInt(tags.status, 10) : null,
        response: { status: null, headers: null, body: null },
        timings: { totalMs: 0 },
      };
      byKey.set(key, row);
    }
    if (p.metric === 'http_req_duration') row.timings.totalMs = Math.round(p.data.value);
    if (tags.status) row.status = parseInt(tags.status, 10);
    row.response.status = row.status;
  }
  return [...byKey.values()];
}

function reconstructChecks(points) {
  const list = [];
  for (const p of points) {
    if (p.type !== 'Point' || p.metric !== 'checks') continue;
    const tags = p.data?.tags || {};
    if (!tags.check) continue;
    list.push({ name: tags.check, pass: p.data.value === 1 });
  }
  return list;
}

function reconstructGroupTree(points) {
  const seen = new Set();
  const ordered = [];
  for (const p of points) {
    if (p.type !== 'Point') continue;
    const g = p.data?.tags?.group;
    if (!g || seen.has(g)) continue;
    seen.add(g);
    ordered.push(g);
  }
  const roots = [];
  const map = new Map();
  for (const g of ordered) {
    const parts = g.split('::').filter(Boolean);
    let parent = null;
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}::${part}` : `::${part}`;
      if (!map.has(acc)) {
        const node = { name: part, children: [] };
        map.set(acc, node);
        if (parent) parent.children.push(node);
        else roots.push(node);
      }
      parent = map.get(acc);
    }
  }
  return roots;
}

export async function collectK6(dir) {
  const points = readJsonl(path.join(dir, 'metrics.jsonl'));
  const summary = readJson(path.join(dir, 'summary.json'), null);
  return {
    requests: reconstructRequests(points),
    checks: reconstructChecks(points),
    groupTree: reconstructGroupTree(points),
    threwError: !!(summary?.root_group?.checks?.some?.((c) => c.fails > 0)),
    summary,
  };
}
