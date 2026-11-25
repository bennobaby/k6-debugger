import fs from 'node:fs';
import path from 'node:path';

export class TimelineStore {
  constructor({ outFile, maxInMem = 5000 } = {}) {
    this.outFile = outFile;
    this.max = maxInMem;
    this.byId = new Map();
    this.order = [];
  }

  upsert(id, patch) {
    const cur = this.byId.get(id);
    if (!cur) {
      this.byId.set(id, { requestId: id, ...patch });
      this.order.push(id);
      if (this.order.length > this.max) {
        const drop = this.order.shift();
        this.byId.delete(drop);
      }
    } else {
      Object.assign(cur, patch);
    }
  }

  all() {
    return this.order.map((id) => this.byId.get(id)).filter(Boolean);
  }

  persist() {
    if (!this.outFile) return;
    fs.mkdirSync(path.dirname(this.outFile), { recursive: true });
    const lines = this.all().map((e) => JSON.stringify(e)).join('\n');
    fs.writeFileSync(this.outFile, lines + (lines ? '\n' : ''));
  }
}
