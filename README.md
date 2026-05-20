# k6-debugger

**Run [k6](https://k6.io) load-test scripts under Node.js — with native VSCode breakpoints, a request timeline, execution tracing, deterministic replay, and runtime parity checks. No k6 binary required.**

k6 runs your scripts in a Go-embedded JavaScript runtime (goja) that can't be attached to a JavaScript debugger. That makes stepping through a failing script painful. **k6-debugger** loads the *same, unmodified* script under Node.js, transparently swapping `k6`/`k6/http`/etc. imports for compatible stubs and executing real HTTP via the system `curl`. Your script doesn't change; you get real breakpoints plus observability the k6 binary doesn't expose.

```bash
npx k6-debugger run script.js --trace --trace-print --timeline --timeline-print
```

> ⚠️ **k6-debugger is a debugging aid, not a load generator.** It runs one iteration, single "VU", via `curl`. It does **not** replace `k6 run` for performance testing. Use the `parity` command to confirm behavior matches real k6.

---

## Why

| Pain with raw k6 | k6-debugger |
|---|---|
| No JS breakpoints (goja has no DAP) | Native VSCode/Node inspector breakpoints |
| `console.log` debugging only | Step, watch, inspect `res.body`/`res.json()` live |
| Opaque request timing | Per-stage timeline (DNS/TCP/TLS/TTFB/download) |
| Flat output | Execution graph: group → http → check tree |
| Can't re-run a failed iteration offline | Record once, replay deterministically (no backend/auth) |
| "Does my debug run match real k6?" | `parity` command diffs the two |

---

## Install

```bash
# one-off
npx k6-debugger run script.js

# project dev dep
npm i -D k6-debugger
```

Requires **Node ≥ 18.19** and **`curl`** on `PATH` (preinstalled on macOS, most Linux, and Windows 10+).

---

## Quick start

```bash
# plain debug run
k6-debugger run examples/smoke.js

# everything on, printed to console
k6-debugger run examples/smoke.js --all --trace-print --timeline-print --no-sleep

# record a snapshot, then replay it offline
k6-debugger run examples/smoke.js --record
k6-debugger replay .artifacts/snapshot-*.json --mode mock

# compare against the real k6 binary
k6-debugger parity examples/smoke.js
```

Artifacts land in `.artifacts/` (configurable with `--out`).

---

## The four capabilities

### 1. Request Timeline
Per-request waterfall reconstructed from `curl`'s own timing counters — no extra round-trips.

```
████                          GET  /uuid       200 210ms
    █████                     POST /anything    200 260ms
```

`timeline.json` (Chrome-DevTools-shaped) + `timeline.jsonl`:

```json
{ "requestId": "req_…", "method": "POST", "url": "…",
  "timing": { "dns": 4, "connect": 11, "ssl": 22, "send": 1, "wait": 134, "receive": 8, "total": 180 },
  "status": 200 }
```

Flags: `--timeline`, `--timeline-print`.

### 2. Execution Tracing
Logical flow across `group()`, HTTP calls, `check()`, and `sleep()`.

```
Step 1: fetch seed (210ms)
 └── GET /uuid (208ms)
Step 2: echo back (260ms)
 └── POST /anything (258ms) ✖
```

`trace.json` (tree), optional `trace.mmd` (Mermaid), optional OTLP/HTTP export to Jaeger/Tempo/Grafana.

Flags: `--trace`, `--trace-print`, `--trace-mermaid`, `--otlp <endpoint>`.

### 3. Replay Engine
Record a run, replay it deterministically.

| Mode | Behavior |
|---|---|
| `mock` | Every request served from snapshot — instant, no backend, no auth |
| `live` | Snapshot miss falls back to real `curl` |
| `step` | Mock + pauses before each request (set `globalThis.__replayContinue = true` to advance) |

```bash
k6-debugger run script.js --record
k6-debugger replay .artifacts/snapshot-1234.json --mode mock
```

Sensitive headers (`authorization`, `cookie`, `x-api-key`, …) are redacted in snapshots by default. Body capture can be size-capped with `K6_DEBUG_REPLAY_TRUNCATE_BODY`.

### 4. Runtime Parity
Runs your script through **both** k6-debugger and the real `k6` binary, then diffs status, headers (volatile ones ignored), body shape, checks, group nesting, timing (with tolerance), and error propagation.

```
── parity report ──
✔ http.identity
✔ groups.nesting
⚠ http.timing
   ⚠ [1] 258ms vs 88ms (>50%)
✖ http.body.shape
   ✖ [0] {"id":"string"} vs {"id":"number"}
── verdict: FAIL  ok=12 warn=1 fail=1
```

Outputs `report.json` + `report.md`. Exits non-zero on `FAIL` — drop it into CI. If `k6` isn't on `PATH`, parity warns and emits a partial report.

---

## Debugging in VSCode

A ready-made [.vscode/launch.json](.vscode/launch.json) ships two configs:

- **k6-debugger: run (with observability)** — set breakpoints in your script, F5.
- **k6-debugger: replay snapshot (mock)** — step through a recorded failure offline, with the real captured response bytes.

Mid-run, while paused at a breakpoint, the Debug Console exposes:

```js
__trace.dump()      // execution graph so far
__timeline.dump()   // waterfall so far
```

---

## Auth / setup data

k6's `setup()` lifecycle is mirrored via an optional module:

```bash
k6-debugger run script.js --setup ./auth.mjs      # or env: K6_DEBUG_SETUP=./auth.mjs
# or skip entirely:
AUTH_TOKEN=xyz k6-debugger run script.js
```

The module exports `setup()`, `setupAuth()`, or `default()` returning either a token string or a `data` object — handed to your script's `export default function (data) {…}`. See [examples/setup.example.mjs](examples/setup.example.mjs).

---

## CLI reference

```
k6-debugger run    <script.js>     [--all] [--timeline[-print]] [--trace[-print]]
                              [--trace-mermaid] [--otlp <url>] [--record]
                              [--no-sleep] [--http-log] [--out <dir>] [--setup <mod>]
k6-debugger replay <snapshot.json> [--mode mock|live|step] [--no-sleep] [--out <dir>]
k6-debugger parity <script.js>     [--out <dir>]
k6-debugger --help | --version
```

Every flag has an env-var equivalent (`K6_DEBUG_TIMELINE`, `K6_DEBUG_TRACE`, `K6_DEBUG_REPLAY`, `K6_DEBUG_OUT`, `AUTH_TOKEN`, `DEBUG_NO_SLEEP`, …) for use in `launch.json` or CI.

---

## How it works

```
node --experimental-loader src/loader.mjs  src/run.mjs  your-script.js
        │                                      │
        │  ESM resolve hook                    │  orchestrator
        ▼                                      ▼
 k6, k6/http, k6/encoding, …  ──►  src/stubs/*   (compatible shims)
 real HTTP                    ──►  src/lib/curl-client.mjs (system curl)
        │
        └─ emits lifecycle events on a synchronous in-process bus
                 │
   timeline / tracing / replay subscribe; flush artifacts on exit
```

- **No script modification.** Imports are redirected by a Node ESM loader hook.
- **Synchronous semantics preserved.** `http.get` blocks like in k6; `sleep` uses `Atomics.wait`.
- **Zero overhead when off.** The event bus has no listeners unless a feature flag is set.

### Supported k6 surface
`k6` (`group`, `check`, `sleep`, `fail`, `randomSeed`), `k6/http` (all verbs + `batch`), `k6/encoding`, `k6/data` (`SharedArray`), `k6/metrics` (stubs), `k6/execution`. `__ENV` and `open()` are globals.

### Not (yet) supported
WebSockets, gRPC, `k6/crypto` extras, real metrics aggregation, multi-VU/scenario execution. These are out of scope — k6-debugger debugs logic and HTTP, not load.

---

## Programmatic API

```js
import { compareRuns, formatWaterfall, buildTree } from 'k6-debugger';
```

See [src/index.mjs](src/index.mjs) for the full surface.

---

## Status & license

Early (`0.1.x`). Interfaces may change. **License: TBD** — see [LICENSE](LICENSE); not yet redistributable until a license is chosen.

Contributions welcome once the license lands. Run the suite with `npm test` (`node --test`).
