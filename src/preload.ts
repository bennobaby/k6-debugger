import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envProxy = new Proxy(
  {},
  {
    get(_t, key) {
      if (typeof key !== 'string') return undefined;
      return process.env[key];
    },
    has(_t, key) {
      return typeof key === 'string' && key in process.env;
    },
  },
);

globalThis.__ENV = envProxy;

globalThis.open = function open(target) {
  let filePath = target;
  if (typeof target === 'string' && target.startsWith('file://')) {
    filePath = fileURLToPath(target);
  } else if (typeof target === 'string' && !path.isAbsolute(target)) {
    filePath = path.resolve(process.cwd(), target);
  }
  return fs.readFileSync(filePath, 'utf8');
};

globalThis.fail = function fail(message) {
  throw new Error(`k6 fail(): ${message}`);
};

export { envProxy };
