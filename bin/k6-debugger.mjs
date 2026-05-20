#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', 'src');
const RUN = path.join(SRC, 'run.mjs');
const REGISTER_URL = pathToFileURL(path.join(SRC, 'register.mjs')).href;

function readPkgVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(HERE, '..', 'package.json'), 'utf8'));
    return pkg.version;
  } catch { return '0.0.0'; }
}

const HELP = `k6-debugger v${readPkgVersion()} — run k6 scripts under Node.js with debugging & observability

Usage:
  k6-debugger run <script.js> [options]        Run a k6 script under Node (debuggable)
  k6-debugger replay <snapshot.json> [options] Replay a recorded run
  k6-debugger parity <script.js> [options]     Compare k6-debugger output vs real k6
  k6-debugger --version
  k6-debugger --help

run options:
  --timeline                 Capture request timeline (waterfall)
  --timeline-print           Print waterfall to console on exit
  --trace                    Capture execution trace (group/http tree)
  --trace-print              Print execution graph to console on exit
  --trace-mermaid            Also write trace.mmd (Mermaid graph)
  --otlp <endpoint>          Export trace via OTLP/HTTP JSON
  --record                   Record a replay snapshot
  --no-sleep                 Skip sleep() calls
  --http-log                 Log each HTTP request line
  --out <dir>                Artifact output dir (default: .artifacts)
  --setup <module>           Module exporting setup()/setupAuth()/default()
  --all                      Shortcut for --timeline --trace --record

replay options:
  --mode <mock|live|step>    Replay strategy (default: mock)
  --no-sleep                 Skip sleep() calls
  --out <dir>                Artifact output dir

parity options:
  --out <dir>                Artifact output dir (default: .parity)

Environment variables mirror every flag (AUTH_TOKEN, K6_DEBUG_*). See README.
`;

// Flags that consume the following token as their value. Everything else is
// boolean, so a positional (e.g. the script path) is never swallowed by a flag.
const VALUE_FLAGS = new Set(['otlp', 'out', 'setup', 'mode']);

function parseFlags(args) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      let key = a.slice(2);
      // Support --key=value form.
      const eq = key.indexOf('=');
      if (eq !== -1) {
        flags[key.slice(0, eq)] = key.slice(eq + 1);
        continue;
      }
      if (VALUE_FLAGS.has(key)) {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { flags, positionals };
}

function requireScript(positionals, what) {
  const p = positionals[0];
  if (!p) {
    console.error(`Error: missing ${what}.\n`);
    console.error(HELP);
    process.exit(2);
  }
  return p;
}

function runEnvFromFlags(flags) {
  const env = { ...process.env };
  if (flags.timeline || flags.all) env.K6_DEBUG_TIMELINE = '1';
  if (flags.trace || flags.all) env.K6_DEBUG_TRACE = '1';
  if (flags.record || flags.all) env.K6_DEBUG_REPLAY = 'record';
  if (flags['timeline-print']) env.K6_DEBUG_TIMELINE_PRINT = '1';
  if (flags['trace-print']) env.K6_DEBUG_TRACE_PRINT = '1';
  if (flags['trace-mermaid']) env.K6_DEBUG_TRACE_MERMAID = '1';
  if (flags.otlp) env.K6_DEBUG_TRACE_OTLP = String(flags.otlp);
  if (flags['no-sleep']) env.DEBUG_NO_SLEEP = '1';
  if (flags['http-log']) env.K6_DEBUG_HTTP = '1';
  if (flags.out) env.K6_DEBUG_OUT = path.resolve(process.cwd(), String(flags.out));
  if (flags.setup) env.K6_DEBUG_SETUP = path.resolve(process.cwd(), String(flags.setup));
  return env;
}

function cmdRun(args) {
  const { flags, positionals } = parseFlags(args);
  const script = requireScript(positionals, 'script path');
  const env = runEnvFromFlags(flags);
  const r = spawnSync(process.execPath, ['--import', REGISTER_URL, RUN, script], {
    stdio: 'inherit',
    env,
  });
  process.exit(r.status ?? 1);
}

function cmdReplay(args) {
  const { flags, positionals } = parseFlags(args);
  const snapshotArg = requireScript(positionals, 'snapshot path');
  const mode = flags.mode ? String(flags.mode) : 'mock';
  if (!['mock', 'live', 'step'].includes(mode)) {
    console.error(`Error: --mode must be mock|live|step, got '${mode}'`);
    process.exit(2);
  }
  const snapshotPath = path.resolve(process.cwd(), snapshotArg);
  if (!fs.existsSync(snapshotPath)) {
    console.error(`Snapshot not found: ${snapshotPath}`);
    process.exit(2);
  }
  const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const target = snap.target;
  if (!target) {
    console.error('Snapshot missing "target" script path.');
    process.exit(2);
  }

  const env = {
    ...process.env,
    K6_DEBUG_REPLAY: mode,
    K6_DEBUG_REPLAY_FILE: snapshotPath,
  };
  if (flags['no-sleep']) env.DEBUG_NO_SLEEP = '1';
  if (flags.out) env.K6_DEBUG_OUT = path.resolve(process.cwd(), String(flags.out));
  for (const [k, v] of Object.entries(snap.env || {})) {
    if (env[k] == null) env[k] = v;
  }

  const r = spawnSync(process.execPath, ['--import', REGISTER_URL, RUN, target], {
    stdio: 'inherit',
    env,
  });
  process.exit(r.status ?? 1);
}

async function cmdParity(args) {
  const { flags, positionals } = parseFlags(args);
  const script = requireScript(positionals, 'script path');
  const { runParity } = await import(pathToFileURL(path.join(SRC, 'parity', 'runner.mjs')).href);
  const outDir = flags.out ? path.resolve(process.cwd(), String(flags.out)) : undefined;
  const report = await runParity({ script, outDir });
  process.exit(report.verdict === 'FAIL' ? 1 : 0);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case 'run': return cmdRun(rest);
    case 'replay': return cmdReplay(rest);
    case 'parity': return cmdParity(rest);
    case '--version':
    case '-v':
      console.log(readPkgVersion());
      return;
    case '--help':
    case '-h':
    case undefined:
      console.log(HELP);
      return;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(2);
  }
}

main();
