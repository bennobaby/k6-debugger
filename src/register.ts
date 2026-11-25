import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const loaderPath = path.join(HERE, 'loader.js');
const loaderUrl = pathToFileURL(loaderPath).href;

register(loaderUrl, import.meta.url);
