export const defaults = Object.freeze({
  timingPct: 0.5,
  ignoreHeaders: new Set([
    'date', 'x-request-id', 'x-amzn-trace-id', 'set-cookie',
    'cf-ray', 'server', 'x-runtime', 'etag', 'last-modified',
  ]),
  bodyByteEq: false,
  shapeDepth: 3,
  checkPassMustMatch: true,
});
