import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STUB_DIR = path.resolve(ROOT, 'stubs');

const MAP = {
  'k6': 'k6.js',
  'k6/http': 'k6-http.js',
  'k6/encoding': 'k6-encoding.js',
  'k6/data': 'k6-data.js',
  'k6/metrics': 'k6-metrics.js',
  'k6/execution': 'k6-execution.js',
};

const REPLAY_MODES = new Set(['mock', 'live', 'step']);
const REAL_CURL_URL = pathToFileURL(path.join(ROOT, 'lib', 'curl-client.mjs')).href;
const REPLAY_RUNTIME_URL = pathToFileURL(path.join(ROOT, 'replay', 'replay-runtime.mjs')).href;

function replayActive() {
  return REPLAY_MODES.has(process.env.K6_DEBUG_REPLAY);
}

export async function resolve(specifier, context, nextResolve) {
  const stubFile = MAP[specifier];
  if (stubFile) {
    const stubPath = path.join(STUB_DIR, stubFile);
    return { url: pathToFileURL(stubPath).href, shortCircuit: true, format: 'module' };
  }

  if (replayActive()) {
    const bareSpecifier = specifier.split('?')[0];
    const hasRealBypass = specifier.includes('?real=1');
    if (hasRealBypass) {
      const resolved = await nextResolve(bareSpecifier, context);
      return { ...resolved, shortCircuit: true };
    }
    const resolved = await nextResolve(specifier, context);
    if (resolved.url === REAL_CURL_URL) {
      return { url: REPLAY_RUNTIME_URL, shortCircuit: true, format: 'module' };
    }
    return resolved;
  }

  return nextResolve(specifier, context);
}
