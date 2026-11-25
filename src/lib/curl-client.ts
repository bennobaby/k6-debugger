import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { parseHeaderBlock } from './headers.js';
import { buildResponse } from './response.js';
import { bus, EVENTS } from './obs-bus.js';

const TIMING_FMT =
  '%{http_code}\n%{time_namelookup}\n%{time_connect}\n%{time_appconnect}\n' +
  '%{time_pretransfer}\n%{time_starttransfer}\n%{time_total}\n%{num_redirects}\n%{size_download}\n';

function tmpFile(prefix) {
  return path.join(os.tmpdir(), `${prefix}-${crypto.randomBytes(6).toString('hex')}`);
}

function headerArgs(headers) {
  const args = [];
  for (const [k, v] of Object.entries(headers || {})) {
    args.push('-H', `${k}: ${v}`);
  }
  return args;
}

const DURATION_UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 };

function parseDurationMs(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return NaN;
  const s = raw.trim();
  if (s === '') return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const re = /(\d+(?:\.\d+)?)(ms|s|m|h)/g;
  let m;
  let total = 0;
  let matched = false;
  while ((m = re.exec(s)) !== null) {
    matched = true;
    total += parseFloat(m[1]) * DURATION_UNITS[m[2]];
  }
  return matched ? total : NaN;
}

function resolveTimeoutSeconds(params) {
  const raw = params?.timeout ?? config.defaultTimeoutMs;
  const ms = parseDurationMs(raw);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms / 1000;
}

export const FILE_BRAND = '__k6File';
function isFileField(v) {
  return v != null && typeof v === 'object' && v[FILE_BRAND] === true;
}

function fileBytes(data) {
  if (data == null) return Buffer.alloc(0);
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(String(data), 'utf8');
}

function buildBodyArgs(body) {
  if (body == null || body === '') return { args: [], contentType: null, files: [] };

  if (typeof body === 'string') {
    const file = tmpFile('req');
    fs.writeFileSync(file, body);
    return { args: ['--data-binary', `@${file}`], contentType: null, files: [file] };
  }

  if (typeof body === 'object') {
    const entries = Object.entries(body);
    if (entries.some(([, v]) => isFileField(v))) {
      const args = [];
      const files = [];
      for (const [k, v] of entries) {
        if (isFileField(v)) {
          const tmp = tmpFile('upload');
          fs.writeFileSync(tmp, fileBytes(v.data));
          files.push(tmp);
          let spec = `${k}=@${tmp}`;
          if (v.content_type) spec += `;type=${v.content_type}`;
          if (v.filename) spec += `;filename=${v.filename}`;
          args.push('-F', spec);
        } else {
          args.push('-F', `${k}=${v == null ? '' : String(v)}`);
        }
      }

      return { args, contentType: null, files };
    }

    const usp = new URLSearchParams();
    for (const [k, v] of entries) usp.append(k, v == null ? '' : String(v));
    const file = tmpFile('req');
    fs.writeFileSync(file, usp.toString());
    return { args: ['--data-binary', `@${file}`], contentType: 'application/x-www-form-urlencoded', files: [file] };
  }

  const file = tmpFile('req');
  fs.writeFileSync(file, String(body));
  return { args: ['--data-binary', `@${file}`], contentType: null, files: [file] };
}

function hasHeader(headers, name) {
  const lower = name.toLowerCase();
  return Object.keys(headers || {}).some((k) => k.toLowerCase() === lower);
}

let cookieJarFile = null;
export function cookieJarPath() {
  if (!cookieJarFile) {
    cookieJarFile = tmpFile('cookies');
    try { fs.writeFileSync(cookieJarFile, '# Netscape HTTP Cookie File\n'); } catch {}
    process.on('exit', () => { try { fs.unlinkSync(cookieJarFile); } catch {} });
  }
  return cookieJarFile;
}

export function setCookie(url, name, value, opts = {}) {
  let host = '';
  let secure = false;
  try { const u = new URL(url); host = u.hostname; secure = u.protocol === 'https:'; } catch {}
  const domain = opts.domain || host;
  if (!domain || !name) return;
  const expiry = opts.expires ? Math.floor(new Date(opts.expires).getTime() / 1000) : 0;
  const line = [domain, 'FALSE', opts.path || '/', secure ? 'TRUE' : 'FALSE', expiry, name, value ?? ''].join('\t');
  try { fs.appendFileSync(cookieJarPath(), line + '\n'); } catch {}
}

export function cookiesForURL(url) {
  let host = '';
  let path = '/';
  try { const u = new URL(url); host = u.hostname; path = u.pathname || '/'; } catch {}
  const out = {};
  let raw = '';
  try { raw = fs.readFileSync(cookieJarPath(), 'utf8'); } catch { return out; }
  for (const line of raw.split('\n')) {
    if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) continue;
    const parts = line.replace(/^#HttpOnly_/, '').split('\t');
    if (parts.length < 7) continue;
    const [cdomain, , cpath, , , cname, cvalue] = parts;
    const bare = cdomain.replace(/^\./, '');
    if ((host === bare || host.endsWith('.' + bare)) && path.startsWith(cpath || '/')) {
      out[cname] = cvalue;
    }
  }
  return out;
}

function safeRead(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function safeUnlink(file) {
  if (!file) return;
  try { fs.unlinkSync(file); } catch {}
}

function curlTimingsToMs(t) {
  const s = (k) => {
    const n = parseFloat(t[k]);
    return Number.isFinite(n) ? Math.max(0, Math.round(n * 1000)) : 0;
  };
  const dns = s('namelookup');
  const conn = s('connect');
  const app = s('appconnect');
  const pre = s('pretransfer');
  const startt = s('starttransfer');
  const total = s('total');
  return {
    dnsMs: dns,
    connectMs: Math.max(0, conn - dns),
    tlsMs: Math.max(0, app - conn),
    sendMs: Math.max(0, pre - Math.max(app, conn)),
    waitMs: Math.max(0, startt - pre),
    downloadMs: Math.max(0, total - startt),
    totalMs: total,
  };
}

function parseTimingStdout(stdout) {
  const parts = stdout.split('\n');
  return {
    code: parseInt(parts[0], 10) || 0,
    namelookup: parts[1],
    connect: parts[2],
    appconnect: parts[3],
    pretransfer: parts[4],
    starttransfer: parts[5],
    total: parts[6],
    redirects: parseInt(parts[7], 10) || 0,
    bytes: parseInt(parts[8], 10) || 0,
  };
}

export function curlRequest(method, url, body, params = {}) {
  const start = Date.now();
  const requestId = bus.newId('req');
  bus.emit(EVENTS.HTTP_START, {
    requestId, method: method.toUpperCase(), url,
    headers: params.headers || {}, body, ts: start,
  });

  const upperMethod = method.toUpperCase();
  const headerFile = tmpFile('hdr');
  const bodyFile = tmpFile('body');
  const jar = cookieJarPath();
  const { args: bodyArgs, contentType, files: bodyFiles } = buildBodyArgs(body);

  const args = [
    '-sS',
    '--compressed',
    '-b', jar, '-c', jar,
    '-o', bodyFile,
    '-D', headerFile,
    '-w', TIMING_FMT,
  ];

  if (upperMethod === 'HEAD') {
    args.push('--head');
  } else {
    args.push('-X', upperMethod);
  }

  const maxRedirects = params.redirects != null ? Number(params.redirects) : config.maxRedirects;
  if (Number.isFinite(maxRedirects) && maxRedirects > 0) {
    args.push('-L', '--max-redirs', String(maxRedirects));
  }

  if (params.insecureSkipTLSVerify || config.insecureTLS) args.push('-k');

  args.push(...headerArgs(params.headers));

  if (contentType && !hasHeader(params.headers, 'content-type')) {
    args.push('-H', `Content-Type: ${contentType}`);
  }

  const timeoutSec = resolveTimeoutSeconds(params);
  if (timeoutSec) args.push('--max-time', String(timeoutSec));
  args.push(...bodyArgs);
  args.push(url);

  let status = 0;
  let error = '';
  let errorCode = 0;
  let timings = { dnsMs: 0, connectMs: 0, tlsMs: 0, sendMs: 0, waitMs: 0, downloadMs: 0, totalMs: 0 };
  let redirects = 0;
  let bytes = 0;
  try {
    const stdout = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: config.curlMaxBuffer });
    const parsed = parseTimingStdout(stdout.trim());
    status = parsed.code;
    redirects = parsed.redirects;
    bytes = parsed.bytes;
    timings = curlTimingsToMs(parsed);
  } catch (e) {
    error = e.stderr?.toString?.() || e.message || String(e);
    errorCode = 1;
  }

  const durationMs = Date.now() - start;

  const bodyText = upperMethod === 'HEAD' ? '' : safeRead(bodyFile);
  const headerText = safeRead(headerFile);
  const { headers } = parseHeaderBlock(headerText);

  safeUnlink(bodyFile);
  safeUnlink(headerFile);
  for (const f of bodyFiles) safeUnlink(f);

  bus.emit(EVENTS.HTTP_TIMING, { requestId, ...timings, redirects, bytes, ts: Date.now() });

  if (config.logHttp) {
    console.log(`  [HTTP] ${upperMethod} ${url} -> ${status} (${durationMs}ms)`);
  }

  const response = buildResponse({
    method, url, body, params,
    status, bodyText, headers, durationMs,
    error, error_code: errorCode,
  });

  bus.emit(EVENTS.HTTP_END, {
    requestId, status, durationMs, error, errorCode,
    responseBody: bodyText, responseHeaders: headers, ts: Date.now(),
  });

  return response;
}
