import fs from 'node:fs';
import { config } from '../lib/config.mjs';
import { ReplayIndex, makeReplayCurl } from './replayer.mjs';

if (!config.features.replay || config.features.replay === 'record') {
  throw new Error('replay-runtime imported without K6_DEBUG_REPLAY mode set to mock|live|step');
}
if (!config.replayFile) {
  throw new Error('K6_DEBUG_REPLAY_FILE must point to a snapshot JSON file');
}

const snapshot = JSON.parse(fs.readFileSync(config.replayFile, 'utf8'));
const index = new ReplayIndex(snapshot);

let liveFallback = null;
if (config.features.replay === 'live') {
  const real = await import('../lib/curl-client.mjs?real=1');
  liveFallback = real.curlRequest;
}

console.log(`[k6-debugger] replay mode=${config.features.replay} requests=${snapshot.requests?.length ?? 0} file=${config.replayFile}`);

export const curlRequest = makeReplayCurl({ index, mode: config.features.replay, liveFallback });
