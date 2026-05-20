export class Span {
  constructor({ id, parent, kind, name, attrs = {}, startTs }) {
    this.id = id;
    this.parent = parent || null;
    this.kind = kind;
    this.name = name;
    this.attrs = { ...attrs };
    this.startTs = startTs;
    this.endTs = null;
    this.status = 'OK';
    this.children = [];
    this.events = [];
  }

  end(ts, status = 'OK') {
    this.endTs = ts;
    this.status = status;
  }

  addEvent(e) { this.events.push(e); }

  get durationMs() {
    return this.endTs != null ? this.endTs - this.startTs : null;
  }
}
