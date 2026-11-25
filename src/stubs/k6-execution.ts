export const vu = {
  idInTest: 1,
  idInInstance: 1,
  iterationInScenario: 0,
  iterationInInstance: 0,
  tags: {},
  metrics: { tags: {}, metadata: {} },
};
export const scenario = {
  name: 'debug',
  executor: 'debug',
  startTime: Date.now(),
  progress: 0,
  iterationInTest: 0,
  iterationInInstance: 0,
};
export const instance = {
  iterationsCompleted: 0,
  iterationsInterrupted: 0,
  vusActive: 1,
  vusInitialized: 1,
  currentTestRunDuration: 0,
};
export const test = {
  abort: (msg) => { throw new Error(`k6 test.abort(): ${msg ?? ''}`); },
  fail: (msg) => { throw new Error(`k6 test.fail(): ${msg ?? ''}`); },
  options: {},
};

const exec = { vu, scenario, instance, test };
export default exec;
