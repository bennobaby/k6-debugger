export function buildTree(roots) {
  const walk = (s) => ({
    id: s.id,
    parent: s.parent,
    kind: s.kind,
    name: s.name,
    status: s.status,
    startTs: s.startTs,
    endTs: s.endTs,
    durationMs: s.durationMs,
    attrs: s.attrs,
    events: s.events,
    children: s.children.map(walk),
  });
  return roots.map(walk);
}

export function toAscii(roots) {
  const lines = [];
  const walk = (s, prefix, isLast, isRoot) => {
    const branch = isRoot ? '' : prefix + (isLast ? '└── ' : '├── ');
    const dur = s.durationMs != null ? ` (${s.durationMs}ms)` : '';
    const status = s.status === 'ERROR' ? ' ✖' : '';
    lines.push(`${branch}${s.name}${dur}${status}`);
    const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');
    s.children.forEach((c, i) => walk(c, childPrefix, i === s.children.length - 1, false));
  };
  roots.forEach((r, i) => walk(r, '', i === roots.length - 1, true));
  return lines.join('\n');
}

export function toMermaid(roots) {
  const lines = ['graph TD'];
  const walk = (s) => {
    for (const c of s.children) {
      lines.push(`  ${s.id}["${esc(s.name)}"] --> ${c.id}["${esc(c.name)}"]`);
      walk(c);
    }
  };
  roots.forEach(walk);
  return lines.join('\n');
}

function esc(s) { return String(s).replace(/"/g, "'"); }
