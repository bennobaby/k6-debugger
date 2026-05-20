import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.mjs';
import { parseHeaderBlock } from './headers.mjs';
import { buildResponse } from './response.mjs';
import { bus, EVENTS } from './obs-bus.mjs';

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

function resolveTimeoutSeconds(params) {
  const raw = params?.timeout ?? config.defaultTimeoutMs;
  const ms = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.ceil(ms / 1000);
}

function writeRequestBody(body) {
  if (body == null || body === '') return null;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const file = tmpFile('req');
  fs.writeFileSync(file, text);
  return file;
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

  const headerFile = tmpFile('hdr');
  const bodyFile = tmpFile('body');
  const requestBodyFile = writeRequestBody(body);

  const args = [
    '-sS',
    '-o', bodyFile,
    '-D', headerFile,
    '-w', TIMING_FMT,
    '-X', method.toUpperCase(),
    ...headerArgs(params.headers),
  ];

  const timeoutSec = resolveTimeoutSeconds(params);
  if (timeoutSec) args.push('--max-time', String(timeoutSec));
  if (requestBodyFile) args.push('--data-binary', `@${requestBodyFile}`);
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
  const bodyText = safeRead(bodyFile);
  const headerText = safeRead(headerFile);
  const { headers } = parseHeaderBlock(headerText);

  safeUnlink(bodyFile);
  safeUnlink(headerFile);
  safeUnlink(requestBodyFile);

  bus.emit(EVENTS.HTTP_TIMING, { requestId, ...timings, redirects, bytes, ts: Date.now() });

  if (config.logHttp) {
    console.log(`  [HTTP] ${method.toUpperCase()} ${url} -> ${status} (${durationMs}ms)`);
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
