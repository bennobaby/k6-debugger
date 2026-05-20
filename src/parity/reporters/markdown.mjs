const ICON = { ok: '✅', warn: '⚠️', fail: '❌' };

export function renderMarkdown({ findings, counts, verdict }) {
  const lines = [];
  lines.push('# k6-debugger Parity Report');
  lines.push('');
  lines.push(`**Verdict:** \`${verdict}\` — ok=${counts.ok} warn=${counts.warn} fail=${counts.fail}`);
  lines.push('');
  lines.push('| Level | Area | Message |');
  lines.push('|-------|------|---------|');
  for (const f of findings) {
    const msg = String(f.msg).replace(/\|/g, '\\|');
    lines.push(`| ${ICON[f.level]} ${f.level} | ${f.area} | ${msg} |`);
  }
  return lines.join('\n') + '\n';
}
