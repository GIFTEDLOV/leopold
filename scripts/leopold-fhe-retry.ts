export type SafeFheRetryOptions = {
  readonly attempts?: number;
  readonly timeoutMs?: number;
  readonly sleepMs?: number;
  readonly onRetry?: (diagnostic: {
    readonly operation: string;
    readonly attempt: number;
    readonly error: string;
  }) => void;
};

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 240);
}

/** Retries only helper/read operations. It never wraps transaction submission. */
export async function retrySafeFheOperation<T>(
  operation: string,
  callback: () => Promise<T>,
  options: SafeFheRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 45_000;
  const sleepMs = options.sleepMs ?? 1_000;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) throw new Error("Invalid FHE helper retry attempts");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
    throw new Error("Invalid FHE helper timeout");
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await Promise.race([
        callback(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`FHE_HELPER_TIMEOUT:${operation}`)), timeoutMs),
        ),
      ]);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      options.onRetry?.({ operation, attempt, error: errorText(error) });
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }
  throw new Error(`FHE_HELPER_FAILED:${operation}:${errorText(lastError)}`);
}
