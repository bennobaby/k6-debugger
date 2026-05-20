export function b64decode(input, encoding = 'std', outputFormat = 's') {
  let normalized = String(input);
  if (encoding === 'rawurl' || encoding === 'url') {
    normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4) normalized += '=';
  }
  const buf = Buffer.from(normalized, 'base64');
  if (outputFormat === 'b') return new Uint8Array(buf);
  return buf.toString('utf8');
}

export function b64encode(input, encoding = 'std') {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  let out = buf.toString('base64');
  if (encoding === 'rawurl' || encoding === 'url') {
    out = out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  return out;
}

export default { b64decode, b64encode };
