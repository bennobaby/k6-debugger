export interface K6Params {
  headers?: Record<string, string>;
  timeout?: number | string;
  redirects?: number;
  insecureSkipTLSVerify?: boolean;
  [key: string]: unknown;
}

export interface K6Response {
  status: number;
  status_text: string;
  body: string;
  headers: Record<string, string>;
  url: string;
  request: { method: string; url: string; body: unknown; params: K6Params | undefined };
  timings: {
    duration: number;
    blocked: number;
    connecting: number;
    sending: number;
    waiting: number;
    receiving: number;
    tls_handshaking: number;
  };
  error: string;
  error_code: number;
  json(selector?: string): unknown;
}

export interface BuildResponseInput {
  method: string;
  url: string;
  body?: unknown;
  params?: K6Params;
  status: number;
  bodyText: string;
  headers: Record<string, string>;
  durationMs: number;
  error?: string;
  error_code?: number;
}

export type FindingLevel = 'ok' | 'warn' | 'fail' | 'skip';
export interface Finding {
  level: FindingLevel;
  area: string;
  msg: string;
}
export type Verdict = 'PASS' | 'WARN' | 'FAIL';
export interface ParityReport {
  findings: Finding[];
  counts: Record<FindingLevel, number>;
  verdict: Verdict;
}

export interface RecordedResponse {
  status: number;
  error: string | null;
  errorCode: number;
  body: string;
  headers: Record<string, string>;
  endTs: number;
}
export interface RecordedRequest {
  requestId?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
  startTs?: number;
  timings?: Record<string, number> | null;
  response?: Partial<RecordedResponse> | null;
}
export interface Snapshot {
  version: number;
  sessionId?: string;
  capturedAt?: string;
  target?: string | null;
  env: Record<string, string>;
  authToken: string | null;
  error: string | null;
  requests: RecordedRequest[];
  spans: unknown[];
  checks: Array<{ name: string; pass: boolean }>;
}
