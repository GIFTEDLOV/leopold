export const metricOperations = [
  "RPC_HEALTH",
  "DEPLOYMENT_HEALTH",
  "ZAMA_HEALTH",
  "DYNAMIC_HEALTH",
  "HEALTH_CHECK",
  "NETWORK_PREFLIGHT",
  "PUBLIC_BALANCE_READ",
  "VAULT_READ",
  "DEPLOYMENT_READ",
  "PRIVATE_HANDLE_READ",
  "FINANCIAL_WRITE_SUBMISSION",
] as const;

export type MetricOperation = (typeof metricOperations)[number];
export type MetricOutcome = "SUCCESS" | "FAILURE";
export type MetricFailureCategory =
  | "NONE"
  | "TIMEOUT"
  | "NETWORK"
  | "RATE_LIMIT"
  | "SERVER"
  | "INVALID_RESPONSE"
  | "CONFIGURATION"
  | "UNKNOWN";

export type MetricAggregate = {
  operation: MetricOperation;
  outcome: MetricOutcome;
  failureCategory: MetricFailureCategory;
  count: number;
  totalDurationMs: number;
  maximumDurationMs: number;
};

type MetricsState = Map<string, MetricAggregate>;

const metricsKey = Symbol.for("leopold.privacy-safe-metrics.v1");

function state(): MetricsState {
  const runtime = globalThis as typeof globalThis & { [metricsKey]?: MetricsState };
  runtime[metricsKey] ??= new Map();
  return runtime[metricsKey];
}

export function recordMetric(
  operation: MetricOperation,
  outcome: MetricOutcome,
  durationMs: number,
  failureCategory: MetricFailureCategory = "NONE",
): void {
  const boundedDuration = Math.max(0, Math.min(300_000, Math.round(Number.isFinite(durationMs) ? durationMs : 0)));
  const category = outcome === "SUCCESS" ? "NONE" : failureCategory;
  const key = `${operation}:${outcome}:${category}`;
  const current = state().get(key);
  state().set(key, {
    operation,
    outcome,
    failureCategory: category,
    count: (current?.count ?? 0) + 1,
    totalDurationMs: (current?.totalDurationMs ?? 0) + boundedDuration,
    maximumDurationMs: Math.max(current?.maximumDurationMs ?? 0, boundedDuration),
  });
  if (typeof window === "undefined" && process.env.NODE_ENV === "production") {
    console.info(
      "LEOPOLD_METRIC",
      JSON.stringify({ operation, outcome, failureCategory: category, durationMs: boundedDuration }),
    );
  }
}

export function getMetricSnapshot(): MetricAggregate[] {
  return [...state().values()].sort((left, right) =>
    `${left.operation}:${left.outcome}:${left.failureCategory}`.localeCompare(
      `${right.operation}:${right.outcome}:${right.failureCategory}`,
    ),
  );
}

export function resetMetricSnapshotForTests(): void {
  state().clear();
}
