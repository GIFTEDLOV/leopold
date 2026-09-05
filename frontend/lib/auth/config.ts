export const AUTH_FIXTURE_MODES = [
  "anonymous",
  "email",
  "wallet",
  "profile-missing",
  "ready",
  "mismatch",
  "expired",
  "conflict",
  "x-unavailable",
] as const;

export type AuthFixtureMode = (typeof AUTH_FIXTURE_MODES)[number];

const isProduction = process.env.NODE_ENV === "production";

export const dynamicEnvironmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID?.trim() ?? "";
export const dynamicApiBaseUrl = process.env.NEXT_PUBLIC_DYNAMIC_API_BASE_URL?.trim() ?? "";
export const dynamicAuthConfigured = dynamicEnvironmentId.length > 0;
export const dynamicXEnabled = process.env.NEXT_PUBLIC_LEOPOLD_ENABLE_X_AUTH === "1";

const requestedFixture = process.env.NEXT_PUBLIC_LEOPOLD_AUTH_FIXTURE?.trim() as AuthFixtureMode | undefined;

/**
 * Fixtures are deliberately compile-time/environment gated and are never
 * available in production builds. They exist only for deterministic UI and
 * guard tests; they are not an authentication mechanism.
 */
export const authFixtureMode: AuthFixtureMode | null =
  !isProduction && requestedFixture && AUTH_FIXTURE_MODES.includes(requestedFixture) ? requestedFixture : null;

export const authFixtureEnabled = authFixtureMode !== null;

export const authConfigurationMessage = dynamicAuthConfigured
  ? null
  : "Dynamic authentication is not configured for this environment.";
