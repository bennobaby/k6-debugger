export function makeRequestEvent({ requestId, method, url, headers, ts }) {
  return {
    type: 'request',
    requestId,
    method,
    url,
    headers: headers || {},
    startTs: ts,
    endTs: null,
    dnsMs: null,
    connectMs: null,
    tlsMs: null,
    sendMs: null,
    waitMs: null,
    downloadMs: null,
    totalMs: null,
    redirects: 0,
    bytes: 0,
    status: null,
    error: null,
  };
}
