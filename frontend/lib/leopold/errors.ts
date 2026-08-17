export type LeopoldErrorCode =
  | "WRONG_NETWORK"
  | "INSUFFICIENT_ETH"
  | "INSUFFICIENT_USDC"
  | "RELAYER_UNAVAILABLE"
  | "CONFIGURATION_MISSING"
  | "ROUND_CLOSED"
  | "USER_REJECTED"
  | "RPC_FAILURE"
  | "RPC_CONFIGURATION_ERROR"
  | "APP_RPC_UNAVAILABLE"
  | "WALLET_RPC_UNAVAILABLE"
  | "TRANSACTION_SIMULATION_FAILED"
  | "TRANSACTION_SIGNING_FAILED"
  | "TRANSACTION_CONFIRMATION_FAILED"
  | "TRANSACTION_REVERTED"
  | "UNSUPPORTED_WALLET"
  | "PRIVATE_LIQUIDITY_UNAVAILABLE"
  | "AUTH_CONFIGURATION_REQUIRED"
  | "AUTH_SESSION_EXPIRED"
  | "AUTH_ACCOUNT_CONFLICT"
  | "FINANCIAL_IDENTITY_REQUIRED"
  | "FINANCIAL_WALLET_CHANGE_REQUIRES_REAUTH"
  | "WALLET_SIGNATURE_REQUIRED"
  | "WALLET_SIGNER_MISMATCH"
  | "WALLET_MISMATCH"
  | "NETWORK_SWITCH_UNAVAILABLE"
  | "ZAMA_AUTHORIZATION_REQUIRED"
  | "UNKNOWN";

export type LeopoldError = { code: LeopoldErrorCode; message: string; technicalDetail?: string };

const messages: Record<LeopoldErrorCode, string> = {
  WRONG_NETWORK: "Switch your wallet to Ethereum Sepolia.",
  INSUFFICIENT_ETH: "You need Sepolia ETH for gas and the refundable bond.",
  INSUFFICIENT_USDC: "Get test USDC first.",
  RELAYER_UNAVAILABLE: "Private processing is temporarily unavailable. Your funds remain onchain.",
  CONFIGURATION_MISSING: "This Leopold deployment is not configured yet.",
  ROUND_CLOSED: "This prize round has already closed.",
  USER_REJECTED: "The wallet request was declined.",
  RPC_FAILURE: "Sepolia RPC is temporarily unavailable.",
  RPC_CONFIGURATION_ERROR: "This application's Sepolia RPC is unavailable.",
  APP_RPC_UNAVAILABLE: "Leopold's Sepolia service is currently unavailable.",
  WALLET_RPC_UNAVAILABLE: "Your wallet's Sepolia connection isn't working.",
  TRANSACTION_SIMULATION_FAILED: "This transaction could not be simulated. No funds were moved.",
  TRANSACTION_SIGNING_FAILED: "The wallet could not submit this transaction. No funds were moved.",
  TRANSACTION_CONFIRMATION_FAILED: "The transaction confirmation could not be verified. Check your wallet activity.",
  TRANSACTION_REVERTED: "The transaction reverted. No funds were moved.",
  UNSUPPORTED_WALLET: "No compatible browser wallet was found.",
  PRIVATE_LIQUIDITY_UNAVAILABLE: "This withdrawal is temporarily unavailable from the vault’s private liquid balance.",
  AUTH_CONFIGURATION_REQUIRED: "Leopold authentication is not configured in this environment.",
  AUTH_SESSION_EXPIRED: "Your Leopold session expired. Sign in again.",
  AUTH_ACCOUNT_CONFLICT: "Resolve the account credential conflict before continuing.",
  FINANCIAL_IDENTITY_REQUIRED: "Complete your Leopold account and link your financial wallet before continuing.",
  FINANCIAL_WALLET_CHANGE_REQUIRES_REAUTH: "The verified financial wallet cannot be replaced automatically.",
  WALLET_SIGNATURE_REQUIRED: "Sign with your external wallet to verify ownership before continuing.",
  WALLET_SIGNER_MISMATCH: "The connected signer does not match your verified financial wallet.",
  WALLET_MISMATCH: "The connected wallet does not match your verified financial wallet.",
  NETWORK_SWITCH_UNAVAILABLE: "Switch your wallet to Ethereum Sepolia.",
  ZAMA_AUTHORIZATION_REQUIRED: "Authorize this wallet again before revealing private financial data.",
  UNKNOWN: "Something went wrong. No funds were moved.",
};

const ERROR_TEXT_KEYS = ["name", "code", "shortMessage", "message", "details", "reason", "data"] as const;

function collectErrorText(error: unknown, seen = new Set<unknown>(), depth = 0): string[] {
  if (error === null || error === undefined || depth > 4 || seen.has(error)) return [];
  if (typeof error === "string" || typeof error === "number" || typeof error === "boolean") return [String(error)];
  if (typeof error !== "object") return [];
  seen.add(error);
  const record = error as Record<string, unknown>;
  const text: string[] = [];
  for (const key of ERROR_TEXT_KEYS) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") text.push(`${key}: ${value}`);
    else if (key === "data" || key === "reason") text.push(...collectErrorText(value, seen, depth + 1));
  }
  for (const key of ["cause", "error"] as const) text.push(...collectErrorText(record[key], seen, depth + 1));
  return text;
}

export function sanitizeTechnicalDetail(error: unknown): string {
  const raw = collectErrorText(error).join(" | ").replace(/\s+/gu, " ").trim();
  return raw
    .replace(/(Bearer\s+)[^\s]+/giu, "$1[redacted]")
    .replace(
      /((?:api[-_]?key|token|secret|password|authorization|project[_-]?id)\s*[:=]\s*)([^\s,;]+)/giu,
      "$1[redacted]",
    )
    .replace(/([?&](?:api[-_]?key|token|secret|project[_-]?id)=)[^&\s]+/giu, "$1[redacted]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/gu, "[redacted-jwt]")
    .slice(0, 500);
}

function errorDetail(error: unknown): string {
  return collectErrorText(error).join(" | ").slice(0, 3000);
}

export function classifyLeopoldError(error: unknown): LeopoldError {
  const detail = errorDetail(error);
  const lower = detail.toLowerCase();
  let code: LeopoldErrorCode = "UNKNOWN";
  if (/^wallet_rpc_unavailable/u.test(lower)) code = "WALLET_RPC_UNAVAILABLE";
  else if (/^app_rpc_unavailable/u.test(lower)) code = "APP_RPC_UNAVAILABLE";
  else if (/^wallet_mismatch/u.test(lower)) code = "WALLET_MISMATCH";
  else if (detail.startsWith("CONFIGURATION_MISSING")) code = "CONFIGURATION_MISSING";
  else if (/user rejected|rejected request|4001/u.test(lower)) code = "USER_REJECTED";
  else if (/wrong_network|wrong chain|chain mismatch|unsupported chain|wrong network/u.test(lower))
    code = "WRONG_NETWORK";
  else if (/insufficient funds|insufficient eth/u.test(lower)) code = "INSUFFICIENT_ETH";
  else if (/insufficient_usdc|insufficient usdc/u.test(lower)) code = "INSUFFICIENT_USDC";
  else if (/roundnotopen|round closed|roundnotopen/u.test(lower)) code = "ROUND_CLOSED";
  else if (/relayer|kms|timeout|socket/u.test(lower)) code = "RELAYER_UNAVAILABLE";
  else if (/liquid|insufficientmanagedassets/u.test(lower)) code = "PRIVATE_LIQUIDITY_UNAVAILABLE";
  else if (/auth_configuration_required/u.test(lower)) code = "AUTH_CONFIGURATION_REQUIRED";
  else if (/auth_session_expired|session.*expired|jwt.*expired/u.test(lower)) code = "AUTH_SESSION_EXPIRED";
  else if (/auth_account_conflict/u.test(lower)) code = "AUTH_ACCOUNT_CONFLICT";
  else if (/financial_identity_required/u.test(lower)) code = "FINANCIAL_IDENTITY_REQUIRED";
  else if (/financial_wallet_change_requires_reauth/u.test(lower)) code = "FINANCIAL_WALLET_CHANGE_REQUIRES_REAUTH";
  else if (/wallet_signature_required/u.test(lower)) code = "WALLET_SIGNATURE_REQUIRED";
  else if (/wallet_signer_mismatch/u.test(lower)) code = "WALLET_SIGNER_MISMATCH";
  else if (/network_switch_unavailable/u.test(lower)) code = "NETWORK_SWITCH_UNAVAILABLE";
  else if (/zama_authorization_required/u.test(lower)) code = "ZAMA_AUTHORIZATION_REQUIRED";
  else if (/action_simulation_failed/u.test(lower)) code = "TRANSACTION_SIMULATION_FAILED";
  else if (/action_signing_failed/u.test(lower)) code = "TRANSACTION_SIGNING_FAILED";
  else if (/action_confirmation_failed/u.test(lower)) code = "TRANSACTION_CONFIRMATION_FAILED";
  else if (/action_reverted/u.test(lower)) code = "TRANSACTION_REVERTED";
  else if (/free plan|upgrade to paid|chain is not available|sepolia\.drpc\.org/u.test(lower))
    code = "WALLET_RPC_UNAVAILABLE";
  else if (/rpc_configuration_error/u.test(lower)) code = "RPC_CONFIGURATION_ERROR";
  else if (/rpc|network|fetch/u.test(lower)) code = "RPC_FAILURE";
  return { code, message: messages[code], technicalDetail: sanitizeTechnicalDetail(error) };
}
