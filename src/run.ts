import './preload.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { config } from './lib/config.js';
import { EXIT_CODES, die, DebuggerError } from './lib/errors.js';
import { bus, EVENTS } from './lib/obs-bus.js';
import { curlRequest } from './lib/curl-client.js';
import { setHttpTransport } from './lib/http-transport.js';
import { ReplayIndex, makeReplayCurl } from './replay/replayer.js';

function resolveTarget() {
  const arg = process.argv[2] || process.env.K6_DEBUG_TARGET;
  if (!arg) {
    die(
      EXIT_CODES.USAGE,
      'No target script provided.',
      'Usage: k6-debugger run <path-to-script.js> — or set K6_DEBUG_TARGET.',
    );
  }
  const abs = path.resolve(process.cwd(), arg);
  if (!fs.existsSync(abs)) {
    die(EXIT_CODES.USAGE, `Script not found: ${abs}`, 'Check the path; must be absolute or relative to cwd.');
  }
  return abs;
}

async function buildSetupData() {
  if (config.authToken) {
    console.log('[k6-debugger] using AUTH_TOKEN from env');
    return { authToken: config.authToken };
  }

  if (config.setupModule) {
    const abs = path.resolve(process.cwd(), config.setupModule);
    if (!fs.existsSync(abs)) {
      die(EXIT_CODES.AUTH_FAILED, `Setup module not found: ${abs}`, 'Check K6_DEBUG_SETUP path.');
    }
    let mod;
    try {
      mod = await import(pathToFileURL(abs).href);
    } catch (e) {
      die(EXIT_CODES.AUTH_FAILED, `Failed to import setup module: ${e.message}`, 'Fix the module or unset K6_DEBUG_SETUP.');
    }
    const fn = mod.setup || mod.setupAuth || mod.default;
    if (typeof fn !== 'function') {
      die(
        EXIT_CODES.AUTH_FAILED,
        `Setup module ${config.setupModule} must export setup(), setupAuth(), or default().`,
        'Export a function returning the data object (or auth token) passed to your script.',
      );
    }
    console.log(`[k6-debugger] calling setup from ${config.setupModule} ...`);
    try {
      const result = await fn();

      if (typeof result === 'string') return { authToken: result };
      return result || {};
    } catch (e) {
      die(EXIT_CODES.AUTH_FAILED, `setup() threw: ${e.message}`, 'Set AUTH_TOKEN to bypass, or fix the setup module.');
    }
  }

  return {};
}

const REPLAY_HTTP_MODES = new Set(['mock', 'live', 'step']);

function installReplayTransport() {
  const mode = config.features.replay;
  if (!REPLAY_HTTP_MODES.has(mode)) return;

  if (!config.replayFile) {
    die(
      EXIT_CODES.USAGE,
      'K6_DEBUG_REPLAY_FILE must point to a snapshot JSON file.',
      'Pass the snapshot path to `k6-debugger replay`.',
    );
  }
  if (!fs.existsSync(config.replayFile)) {
    die(EXIT_CODES.USAGE, `Snapshot not found: ${config.replayFile}`, 'Check K6_DEBUG_REPLAY_FILE.');
  }

  let snapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(config.replayFile, 'utf8'));
  } catch (e) {
    die(EXIT_CODES.USAGE, `Failed to read snapshot: ${e.message}`, 'The file must be JSON written by --record.');
  }

  const index = new ReplayIndex(snapshot);
  const liveFallback = mode === 'live' ? curlRequest : null;
  setHttpTransport(makeReplayCurl({ index, mode, liveFallback }));
  console.log(`[k6-debugger] replay mode=${mode} requests=${snapshot.requests?.length ?? 0} file=${config.replayFile}`);
}

async function bootstrapObservability() {
  installReplayTransport();
  const { features } = config;
  const flushers = [];
  if (features.timeline) {
    const { attach } = await import('./timeline/manager.js');
    flushers.push(attach(bus));
    console.log('[k6-debugger] timeline enabled');
  }
  if (features.tracing) {
    const { attach } = await import('./tracing/tracer.js');
    flushers.push(attach(bus));
    console.log('[k6-debugger] tracing enabled');
  }
  if (features.replay === 'record') {
    const { attach } = await import('./replay/recorder.js');
    const flush = attach(bus, 'record');
    if (flush) flushers.push(flush);
    console.log('[k6-debugger] replay record enabled');
  }

  let flushed = false;
  async function flushAll() {
    if (flushed) return;
    flushed = true;
    bus.emit(EVENTS.SESSION_END, { ts: Date.now() });
    for (const f of flushers) {
      try { await f(); } catch (e) { console.warn('[k6-debugger] flush error:', e.message); }
    }
  }

  process.once('beforeExit', flushAll);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, async () => {
      await flushAll();
      process.exit(sig === 'SIGINT' ? 130 : 143);
    });
  }
  process.on('exit', () => {
    if (flushed) return;
    flushed = true;
    for (const f of flushers) {
      try { f(); } catch {}
    }
  });
  return flushAll;
}

async function loadAndInvoke(target, data) {
  const scriptMod = await import(pathToFileURL(target).href);
  if (typeof scriptMod.default !== 'function') {
    die(
      EXIT_CODES.TARGET_MISSING_DEFAULT,
      'Script has no default export function.',
      'Add: export default function run(data) { ... } — k6 entry-point shape.',
    );
  }
  console.log('[k6-debugger] >>> invoking default(data)');
  const t0 = Date.now();
  try {
    await scriptMod.default(data);
    console.log(`[k6-debugger] <<< done in ${Date.now() - t0}ms`);
  } catch (e) {
    if (e instanceof DebuggerError) throw e;
    console.error('[k6-debugger] script threw:', e);
    throw e;
  }
}

async function main() {
  const target = resolveTarget();
  console.log(`[k6-debugger] target: ${target}`);
  if (config.project) {
    console.log(`[k6-debugger] PROJECT=${config.project} ENVIRONMENT=${config.environment ?? ''}`);
    if (!process.env.PROJECT) process.env.PROJECT = config.project;
    if (config.environment && !process.env.ENVIRONMENT) process.env.ENVIRONMENT = config.environment;
  }

  const flush = await bootstrapObservability();
  let exitCode = 0;
  try {
    const data = await buildSetupData();
    await loadAndInvoke(target, data);
  } catch (e) {
    exitCode = e instanceof DebuggerError ? (e.code || EXIT_CODES.SCRIPT_THREW) : EXIT_CODES.SCRIPT_THREW;
    if (!(e instanceof DebuggerError)) {
      const message = e instanceof Error ? e.message : String(e);
      bus.emit(EVENTS.SCRIPT_ERROR, { message, ts: Date.now() });
    }
  } finally {
    await flush();
    if (exitCode) process.exit(exitCode);
  }
}

main();
