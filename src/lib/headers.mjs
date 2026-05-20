export function parseHeaderBlock(raw) {
  if (!raw) return { headers: {}, statusLine: '' };

  const blocks = raw.split(/\r?\n\r?\n/).map((b) => b.trim()).filter(Boolean);
  const last = blocks[blocks.length - 1] || '';
  const lines = last.split(/\r?\n/);
  const statusLine = lines.shift() || '';

  const headers = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (name) headers[name] = value;
  }
  return { headers, statusLine };
}
