import path from 'node:path';

function flag(name) {
  const v = process.env[name];
  return v === '1' || v === 'true';
}

const VALID_REPLAY_MODES = new Set(['record', 'live', 'mock', 'step']);
function replayMode() {
  const v = process.env.K6_DEBUG_REPLAY;
  if (!v) return null;
  if (!VALID_REPLAY_MODES.has(v)) {
    throw new Error(`K6_DEBUG_REPLAY must be one of ${[...VALID_REPLAY_MODES].join(',')}; got '${v}'`);
  }
  return v;
}

export const config = Object.freeze({
  // Optional project/environment labels — surfaced to scripts via process.env.
  // No hardcoded defaults: this tool is project-agnostic.
  project: process.env.K6_DEBUG_PROJECT || process.env.PROJECT || null,
  environment: process.env.K6_DEBUG_ENV || process.env.ENVIRONMENT || null,

  logHttp: flag('K6_DEBUG_HTTP'),
  noSleep: flag('DEBUG_NO_SLEEP'),
  authToken: process.env.AUTH_TOKEN || null,

  // Optional path to a user module that bootstraps per-iteration data.
  // Module must export `setup()` (preferred) or `setupAuth()` returning data
  // (or a token) handed to the script's default(data) entry point.
  setupModule: process.env.K6_DEBUG_SETUP || null,

  curlMaxBuffer: parseInt(process.env.K6_DEBUG_CURL_MAX_BUFFER, 10) || 64 * 1024 * 1024,
  defaultTimeoutMs: parseInt(process.env.K6_DEBUG_DEFAULT_TIMEOUT_MS, 10) || 30000,

  outDir: path.resolve(process.cwd(), process.env.K6_DEBUG_OUT || '.artifacts'),

  features: Object.freeze({
    timeline: flag('K6_DEBUG_TIMELINE'),
    tracing: flag('K6_DEBUG_TRACE'),
    replay: replayMode(),
  }),
  replayFile: process.env.K6_DEBUG_REPLAY_FILE || null,
  bodyTruncateBytes: parseInt(process.env.K6_DEBUG_REPLAY_TRUNCATE_BODY, 10) || 0,
});
