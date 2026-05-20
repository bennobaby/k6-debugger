import { normalizeHeaders, bodyShape } from './normalize.mjs';
import { defaults } from './tolerances.mjs';

export function compareRuns(dbg, k6, tol = {}) {
  const t = { ...defaults, ...tol };
  const findings = [];
  const push = (level, area, msg) => findings.push({ level, area, msg });

  const dReqs = dbg.requests || [];
  const kReqs = k6.requests || [];

  if (dReqs.length !== kReqs.length) {
    push('fail', 'http.count', `k6-debugger=${dReqs.length} k6=${kReqs.length}`);
  } else {
    push('ok', 'http.count', `${dReqs.length} requests`);
  }

  const n = Math.min(dReqs.length, kReqs.length);
  for (let i = 0; i < n; i++) {
    const a = dReqs[i];
    const b = kReqs[i];
    const tag = `[${i}] ${a.method} ${a.url}`;

    if (a.method !== b.method || a.url !== b.url) {
      push('fail', 'http.identity', `${tag} vs ${b.method} ${b.url}`);
      continue;
    }
    push('ok', 'http.identity', tag);

    if (a.status !== b.status) push('fail', 'http.status', `${tag} ${a.status} vs ${b.status}`);
    else push('ok', 'http.status', `${tag} ${a.status}`);

    // k6's `--out json` emits metric points only — no response headers or body.
    // When that data is absent on the k6 side, skip rather than flag a false diff.
    if (b.response?.headers == null) {
      push('skip', 'http.header', `${tag} k6 JSON output carries no response headers`);
    } else {
      const ah = normalizeHeaders(a.response?.headers, t.ignoreHeaders);
      const bh = normalizeHeaders(b.response?.headers, t.ignoreHeaders);
      const keys = new Set([...Object.keys(ah), ...Object.keys(bh)]);
      let headerDiffs = 0;
      for (const k of keys) {
        if (ah[k] !== bh[k]) {
          push('warn', 'http.header', `${tag} ${k}: '${ah[k] ?? ''}' vs '${bh[k] ?? ''}'`);
          headerDiffs++;
        }
      }
      if (!headerDiffs) push('ok', 'http.header', `${tag} headers match`);
    }

    if (b.response?.body == null) {
      push('skip', 'http.body.shape', `${tag} k6 JSON output carries no response body`);
    } else if (t.bodyByteEq) {
      const ab = a.response?.body || '';
      const bb = b.response?.body || '';
      if (ab !== bb) push('fail', 'http.body', `${tag} byte diff (${ab.length} vs ${bb.length})`);
      else push('ok', 'http.body', tag);
    } else {
      const sa = JSON.stringify(bodyShape(a.response?.body, t.shapeDepth));
      const sb = JSON.stringify(bodyShape(b.response?.body, t.shapeDepth));
      if (sa !== sb) push('fail', 'http.body.shape', `${tag} ${sa} vs ${sb}`);
      else push('ok', 'http.body.shape', tag);
    }

    const dt = a.timings?.totalMs ?? 0;
    const kt = b.timings?.totalMs ?? 0;
    if (kt > 0 && Math.abs(dt - kt) / kt > t.timingPct) {
      push('warn', 'http.timing', `${tag} ${dt}ms vs ${kt}ms (>${(t.timingPct * 100).toFixed(0)}%)`);
    } else {
      push('ok', 'http.timing', `${tag} ${dt}ms vs ${kt}ms`);
    }
  }

  const dC = dbg.checks || [];
  const kC = k6.checks || [];
  if (dC.length !== kC.length) push('fail', 'checks.count', `${dC.length} vs ${kC.length}`);
  else push('ok', 'checks.count', `${dC.length} checks`);
  if (t.checkPassMustMatch) {
    for (let i = 0; i < Math.min(dC.length, kC.length); i++) {
      if (dC[i].pass !== kC[i].pass) {
        push('fail', 'checks.result', `'${dC[i].name}' k6-debugger=${dC[i].pass} k6=${kC[i].pass}`);
      }
    }
  }

  const dTree = JSON.stringify(dbg.groupTree || []);
  const kTree = JSON.stringify(k6.groupTree || []);
  if (dTree !== kTree) push('fail', 'groups.nesting', 'group tree differs');
  else push('ok', 'groups.nesting', 'tree matches');

  if (!!dbg.threwError !== !!k6.threwError) {
    push('fail', 'errors.propagation', `k6-debugger threw=${!!dbg.threwError} k6 threw=${!!k6.threwError}`);
  } else {
    push('ok', 'errors.propagation', 'both ' + (dbg.threwError ? 'threw' : 'passed'));
  }

  for (const u of (dbg.unsupported || [])) push('fail', 'unsupported', u);

  return summarize(findings);
}

function summarize(findings) {
  const counts = { ok: 0, warn: 0, fail: 0, skip: 0 };
  for (const f of findings) counts[f.level] = (counts[f.level] ?? 0) + 1;
  const verdict = counts.fail ? 'FAIL' : counts.warn ? 'WARN' : 'PASS';
  return { findings, counts, verdict };
}
