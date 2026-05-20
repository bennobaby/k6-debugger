// Example setup module. Point k6-debugger at it with:
//   k6-debugger run script.js --setup examples/setup.example.mjs
//
// Export `setup`, `setupAuth`, or `default`. Return either:
//   - a string  -> handed to your script as { authToken: <string> }
//   - an object -> handed to your script as `data` (the default(data) arg)
//
// This mirrors k6's setup() lifecycle without coupling k6-debugger to any project.

export async function setup() {
  // Real projects would log in here and return a token, e.g.:
  //   const res = http.post('https://api.example.com/login', ...);
  //   return res.json().token;
  return { authToken: 'example-token', tenant: 'demo' };
}
