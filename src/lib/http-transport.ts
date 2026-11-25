import { curlRequest } from './curl-client.js';

let transport = curlRequest;

export function setHttpTransport(fn) {
  transport = fn;
}

export function httpRequest(method, url, body, params) {
  return transport(method, url, body, params);
}
