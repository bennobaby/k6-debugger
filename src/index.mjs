// Programmatic API surface for k6-debugger.
// The CLI (bin/k6-debugger.mjs) is the primary entry point; these exports let you
// embed pieces in your own tooling.

export { config } from './lib/config.mjs';
export { bus, EVENTS } from './lib/obs-bus.mjs';
export { buildResponse } from './lib/response.mjs';
export { parseHeaderBlock } from './lib/headers.mjs';

export { TimelineStore } from './timeline/storage.mjs';
export { formatWaterfall, toDevtoolsJson } from './timeline/formatter.mjs';

export { Span } from './tracing/spans.mjs';
export { buildTree, toAscii, toMermaid } from './tracing/graph-builder.mjs';

export { ReplayIndex, makeReplayCurl } from './replay/replayer.mjs';
export { makeSnapshot, SNAPSHOT_VERSION } from './replay/schema.mjs';

export { compareRuns } from './parity/compare.mjs';
export { runParity } from './parity/runner.mjs';
