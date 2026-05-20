// Demonstrates group nesting + a dependent multi-step chain (the pattern k6-debugger
// tracing + replay shine on). Uses public httpbin endpoints.
import http from 'k6/http';
import { check, group, sleep } from 'k6';

export const options = { vus: 1, iterations: 1 };

export default function () {
  const ctx = {};

  group('Step 1: fetch seed', () => {
    const res = http.get('https://httpbin.org/uuid');
    check(res, { 'status 200': (r) => r.status === 200 });
    ctx.uuid = res.json()?.uuid ?? null;
  });

  if (!ctx.uuid) return;
  sleep(0.1);

  group('Step 2: echo back', () => {
    const res = http.post('https://httpbin.org/anything', JSON.stringify({ id: ctx.uuid }), {
      headers: { 'Content-Type': 'application/json' },
    });
    check(res, {
      'status 200': (r) => r.status === 200,
      'echoed id matches': (r) => r.json()?.json?.id === ctx.uuid,
    });
  });
}
