import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

class ObsBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
    this.sessionId = crypto.randomUUID();
    this.startedAt = Date.now();
  }
  newId(prefix = 'id') {
    return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
  }
}

export const bus = new ObsBus();

export const EVENTS = Object.freeze({
  HTTP_START: 'http.start',
  HTTP_TIMING: 'http.timing',
  HTTP_END: 'http.end',
  SPAN_START: 'span.start',
  SPAN_END: 'span.end',
  CHECK: 'check',
  SLEEP: 'sleep',
  SESSION_END: 'session.end',
});
