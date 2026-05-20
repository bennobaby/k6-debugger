export const SNAPSHOT_VERSION = 1;

export function makeSnapshot({ sessionId, target, env, authToken, requests, spans, checks, error }) {
  return {
    version: SNAPSHOT_VERSION,
    sessionId,
    capturedAt: new Date().toISOString(),
    target,
    env: env || {},
    authToken: authToken || null,
    error: error || null,
    requests: requests || [],
    spans: spans || [],
    checks: checks || [],
  };
}
