const ICON = { ok: '✔', warn: '⚠', fail: '✖' };
const RANK = { ok: 0, warn: 1, fail: 2 };

export function renderConsole({ findings, counts, verdict }) {
  const out = ['── parity report ──'];
  const byArea = new Map();
  for (const f of findings) {
    const list = byArea.get(f.area) || [];
    list.push(f);
    byArea.set(f.area, list);
  }
  for (const [area, list] of byArea) {
    const worst = list.reduce((acc, f) => (RANK[f.level] > RANK[acc] ? f.level : acc), 'ok');
    out.push(`${ICON[worst]} ${area}`);
    for (const f of list.filter((x) => x.level !== 'ok')) {
      out.push(`   ${ICON[f.level]} ${f.msg}`);
    }
  }
  out.push(`── verdict: ${verdict}  ok=${counts.ok} warn=${counts.warn} fail=${counts.fail}`);
  return out.join('\n');
}
