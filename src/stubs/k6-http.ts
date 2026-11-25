import { httpRequest } from '../lib/http-transport.js';
import { FILE_BRAND, setCookie, cookiesForURL } from '../lib/curl-client.js';

const http = {
  request: (method, url, body, params) => httpRequest(method, url, body, params),
  asyncRequest: async (method, url, body, params) => httpRequest(method, url, body, params),
  get: (url, params) => httpRequest('GET', url, null, params),
  post: (url, body, params) => httpRequest('POST', url, body, params),
  put: (url, body, params) => httpRequest('PUT', url, body, params),
  patch: (url, body, params) => httpRequest('PATCH', url, body, params),
  del: (url, body, params) => httpRequest('DELETE', url, body, params),
  head: (url, params) => httpRequest('HEAD', url, null, params),
  options: (url, body, params) => httpRequest('OPTIONS', url, body, params),
  batch: (requests) => requests.map((r) => {
    if (Array.isArray(r)) {
      const [method, url, body, params] = r;
      return httpRequest(method, url, body, params);
    }
    return httpRequest(r.method, r.url, r.body, r.params);
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
