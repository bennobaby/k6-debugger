import { curlRequest, FILE_BRAND, setCookie, cookiesForURL } from '../lib/curl-client.mjs';

const http = {
  request: curlRequest,
  asyncRequest: async (method, url, body, params) => curlRequest(method, url, body, params),
  get: (url, params) => curlRequest('GET', url, null, params),
  post: (url, body, params) => curlRequest('POST', url, body, params),
  put: (url, body, params) => curlRequest('PUT', url, body, params),
  patch: (url, body, params) => curlRequest('PATCH', url, body, params),
  del: (url, body, params) => curlRequest('DELETE', url, body, params),
  head: (url, params) => curlRequest('HEAD', url, null, params),
  options: (url, body, params) => curlRequest('OPTIONS', url, body, params),
  batch: (requests) => requests.map((r) => {
    if (Array.isArray(r)) {
      const [method, url, body, params] = r;
      return curlRequest(method, url, body, params);
    }
    return curlRequest(r.method, r.url, r.body, r.params);
  }),
  setResponseCallback: () => {},
  expectedStatuses: (...ranges) => ({ _expected: ranges }),
  file: (data, filename, contentType) => ({ [FILE_BRAND]: true, data, filename, content_type: contentType }),
  url: (strings, ...values) => strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ''), ''),
  cookieJar: () => ({
    set: (url, name, value, opts) => setCookie(url, name, value, opts),
    cookiesForURL: (url) => cookiesForURL(url),
    clear: () => {},
    delete: () => {},
  }),
};

export default http;
export const { request, asyncRequest, get, post, put, patch, del, head, options, batch } = http;
