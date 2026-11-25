import type { TimelineStore } from '../timeline/storage.js';
import type { Span } from '../tracing/spans.js';

declare global {

  var __ENV: Record<string, string | undefined>;

  function open(target: string): string;

  function fail(message?: string): never;

  var __timeline: { store: TimelineStore; dump(): void } | undefined;
  var __trace: { spans: Map<string, Span>; roots: Span[]; dump(): void } | undefined;

  var __replayContinue: boolean | undefined;

}

export {};
