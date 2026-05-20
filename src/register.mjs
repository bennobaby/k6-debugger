// Loader bootstrap used via `node --import ./src/register.mjs`.
// Registers the ESM resolve hook (loader.mjs) without the deprecated
// `--experimental-loader` flag (and its ExperimentalWarning).
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const loaderPath = path.join(HERE, 'loader.mjs');
const loaderUrl = pathToFileURL(loaderPath).href;

register(loaderUrl, import.meta.url);
