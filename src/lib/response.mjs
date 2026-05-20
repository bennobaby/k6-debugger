export function buildResponse({ method, url, body, params, status, bodyText, headers, durationMs, error, error_code }) {
  return {
    status,
    status_text: '',
    body: bodyText,
    headers,
    url,
    request: { method, url, body, params },
    timings: {
      duration: durationMs,
      blocked: 0,
      connecting: 0,
      sending: 0,
      waiting: durationMs,
      receiving: 0,
      tls_handshaking: 0,
    },
    error: error || '',
    error_code: error_code || 0,
    json(selector) {
      try {
        const parsed = JSON.parse(bodyText);
        if (!selector) return parsed;
        return selector.split('.').reduce((acc, k) => acc?.[k], parsed);
      } catch {
        return null;
      }
    },
  };
}
