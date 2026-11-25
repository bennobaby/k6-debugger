import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectDebugger } from './collectors/debugger.js';
import { collectK6 } from './collectors/k6.js';
import { compareRuns } from './compare.js';
import { renderConsole } from './reporters/console.js';
import { renderMarkdown } from './reporters/markdown.js';
import { renderJson } from './reporters/json.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.resolve(HERE, '..', 'run.js');
const REGISTER_URL = pathToFileURL(path.resolve(HERE, '..', 'register.js')).href;

function k6Available() {
  const r = spawnSync('k6', ['version'], { encoding: 'utf8' });
  return r.status === 0;
}

export async function runParity({ script, tolerances = {}, outDir, env = {} }) {
  const root = outDir || path.resolve(process.cwd(), '.parity');
  const debuggerDir = path.join(root, 'k6-debugger');
  const k6Dir = path.join(root, 'k6');
  fs.mkdirSync(debuggerDir, { recursive: true });
  fs.mkdirSync(k6Dir, { recursive: true });

  console.log('[parity] running k6-debugger ...');
  const dbgRun = spawnSync(process.execPath, ['--import', REGISTER_URL, RUN, script], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...env,
      K6_DEBUG_TIMELINE: '1',
      K6_DEBUG_TRACE: '1',
      K6_DEBUG_REPLAY: 'record',
      K6_DEBUG_OUT: debuggerDir,
      DEBUG_NO_SLEEP: '1',
    },
  });

  let k6Ran = false;
  let k6Threw = false;
  if (k6Available()) {
    console.log('[parity] running real k6 ...');
    const r = spawnSync('k6', [
      'run',
      '--summary-export', path.join(k6Dir, 'summary.json'),
      '--out', `json=${path.join(k6Dir, 'metrics.jsonl')}`,
      script,
    ], { stdio: 'inherit', env: { ...process.env, ...env, K6_NO_USAGE_REPORT: 'true' } });

    k6Ran = true;
    k6Threw = r.status !== 0 && r.status !== 99;
  } else {
    console.warn('[parity] k6 binary not on PATH — skipping real run; report will be partial.');
  }

  const dbg = await collectDebugger(debuggerDir);
  if (dbgRun.status !== 0) dbg.threwError = true;
  const k6 = k6Ran ? await collectK6(k6Dir) : { requests: [], checks: [], groupTree: [], threwError: false };
  if (k6Threw) k6.threwError = true;

  const diff = compareRuns(dbg, k6, tolerances);

  fs.writeFileSync(path.join(root, 'report.json'), renderJson(diff));
  fs.writeFileSync(path.join(root, 'report.md'), renderMarkdown(diff));
  console.log(renderConsole(diff));
  console.log(`[parity] artifacts: ${root}`);

  return diff;
}
