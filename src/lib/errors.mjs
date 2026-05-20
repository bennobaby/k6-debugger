export const EXIT_CODES = Object.freeze({
  USAGE: 2,
  AUTH_FAILED: 3,
  TARGET_MISSING_DEFAULT: 4,
  SCRIPT_THREW: 5,
});

export class DebuggerError extends Error {
  constructor(code, message, remediation) {
    super(message);
    this.name = 'DebuggerError';
    this.code = code;
    this.remediation = remediation || '';
  }
  print(stream = process.stderr) {
    stream.write(`[k6-debugger:${this.code}] ${this.message}\n`);
    if (this.remediation) stream.write(`  → ${this.remediation}\n`);
  }
}

export function die(exitCode, message, remediation) {
  const err = new DebuggerError(exitCode, message, remediation);
  err.print();
  process.exit(exitCode);
}
