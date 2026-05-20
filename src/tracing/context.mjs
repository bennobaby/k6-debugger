const stack = [];

export function currentSpanId() {
  return stack.length ? stack[stack.length - 1] : null;
}

export function pushSpan(id) { stack.push(id); }

export function popSpan() { return stack.pop(); }

export function depth() { return stack.length; }
