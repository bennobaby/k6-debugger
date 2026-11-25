class MetricStub {
  constructor(name) { this.name = name; }
  add() {}
}
export class Counter extends MetricStub {}
export class Gauge extends MetricStub {}
export class Rate extends MetricStub {}
export class Trend extends MetricStub {}
