export class SharedArray {
  constructor(_name, loader) {
    const data = typeof loader === 'function' ? loader() : [];
    const arr = Array.isArray(data) ? data : [];
    return new Proxy(arr, {
      get(t, prop) {
        if (prop === 'length') return t.length;
        if (prop === Symbol.iterator) return t[Symbol.iterator].bind(t);
        if (typeof prop === 'string' && /^\d+$/.test(prop)) return t[Number(prop)];
        return t[prop];
      },
      set() { return true; },
    });
  }
}
