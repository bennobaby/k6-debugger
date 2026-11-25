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

export async function resolve(specifier, context, nextResolve) {
  const stubFile = MAP[specifier];
  if (stubFile) {
    const stubPath = path.join(STUB_DIR, stubFile);
    return { url: pathToFileURL(stubPath).href, shortCircuit: true, format: 'module' };
  }

  return nextResolve(specifier, context);
}
