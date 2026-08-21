import { recordMetric, type MetricFailureCategory, type MetricOperation } from "./metrics";

export const DEFAULT_READ_TIMEOUT_MS = 8_000;
export const DEFAULT_READ_MAX_ATTEMPTS = 3;
export const DEFAULT_READ_BACKOFF_MS = 200;

export class ReadTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`READ_TIMEOUT:${timeoutMs}`);
    this.name = "ReadTimeoutError";
  }
}

export class HttpReadError extends Error {
  constructor(readonly status: number) {
    super(`HTTP_READ_ERROR:${status}`);
    this.name = "HttpReadError";
  }
}

export function classifyReadFailure(error: unknown): MetricFailureCategory {
  if (error instanceof ReadTimeoutError) return "TIMEOUT";
  if (error instanceof HttpReadError) {
    if (error.status === 408) return "TIMEOUT";
    if (error.status === 429) return "RATE_LIMIT";
    if (error.status >= 500) return "SERVER";
    return "CONFIGURATION";
  }
  const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  if (/configuration|wrong[_ ]network|chain[_ -]?id|manifest|invalid address/iu.test(message)) return "CONFIGURATION";
  if (/invalid|malformed|unexpected response|json/iu.test(message)) return "INVALID_RESPONSE";
  if (/timeout|timed out|aborterror/iu.test(message)) return "TIMEOUT";
  if (/429|rate.?limit|too many requests/iu.test(message)) return "RATE_LIMIT";
  if (/5\d\d|server error|bad gateway|service unavailable|gateway timeout/iu.test(message)) return "SERVER";
  if (/fetch|network|socket|econn|enotfound|connection|http request failed/iu.test(message)) return "NETWORK";
  return "UNKNOWN";
}

export function isTransientReadFailure(error: unknown): boolean {
  return ["TIMEOUT", "NETWORK", "RATE_LIMIT", "SERVER"].includes(classifyReadFailure(error));
}

export function exponentialBackoffMs(
  failedAttempt: number,
  baseDelayMs = DEFAULT_READ_BACKOFF_MS,
  jitterRatio = 0.2,
  random = Math.random,
): number {
  const exponential = baseDelayMs * 2 ** Math.max(0, failedAttempt - 1);
  const jitter = exponential * jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

type ReadReliabilityOptions = {
  operation: MetricOperation;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  jitterRatio?: number;
  random?: () => number;
  sleep?: (durationMs: number) => Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
};

export async function withReadReliability<T>(
  read: (context: { attempt: number; signal: AbortSignal }) => Promise<T>,
  options: ReadReliabilityOptions,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_READ_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_READ_MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > DEFAULT_READ_MAX_ATTEMPTS) {
    throw new Error("INVALID_READ_ATTEMPT_LIMIT");
  }
  const sleep = options.sleep ?? ((durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs)));
  const shouldRetry = options.shouldRetry ?? isTransientReadFailure;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new ReadTimeoutError(timeoutMs));
        controller.abort();
      }, timeoutMs);
    });
    try {
      const value = await Promise.race([read({ attempt, signal: controller.signal }), timeoutPromise]);
      recordMetric(options.operation, "SUCCESS", Date.now() - startedAt);
      return value;
    } catch (error) {
      const category = classifyReadFailure(error);
      recordMetric(options.operation, "FAILURE", Date.now() - startedAt, category);
      if (attempt >= maxAttempts || !shouldRetry(error)) throw error;
      await sleep(exponentialBackoffMs(attempt, options.baseDelayMs, options.jitterRatio, options.random));
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
  throw new Error("READ_RETRY_EXHAUSTED");
}

/** Financial submissions are deliberately single-shot. Recovery happens from their hash/read state. */
export async function submitFinancialWriteOnce<T>(write: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const value = await write();
    recordMetric("FINANCIAL_WRITE_SUBMISSION", "SUCCESS", Date.now() - startedAt);
    return value;
  } catch (error) {
    recordMetric("FINANCIAL_WRITE_SUBMISSION", "FAILURE", Date.now() - startedAt, classifyReadFailure(error));
    throw error;
  }
}
