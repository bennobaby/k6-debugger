import http from 'k6/http';
import { check, group, sleep } from 'k6';

export const options = { vus: 1, iterations: 1 };

export default function () {
  group('smoke', () => {
    const res = http.get('https://httpbin.org/get');
    check(res, {
      'status is 200': (r) => r.status === 200,
      'body has url': (r) => r.json()?.url?.includes('httpbin.org'),
    });
    sleep(0.1);
  });
}
