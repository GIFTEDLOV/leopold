export type LeopoldErrorCode =
  | "WRONG_NETWORK"
  | "INSUFFICIENT_ETH"
  | "INSUFFICIENT_USDC"
  | "RELAYER_UNAVAILABLE"
  | "CONFIGURATION_MISSING"
  | "ROUND_CLOSED"
  | "USER_REJECTED"
  | "RPC_FAILURE"
  | "UNSUPPORTED_WALLET"
  | "PRIVATE_LIQUIDITY_UNAVAILABLE"
  | "AUTH_CONFIGURATION_REQUIRED"
  | "AUTH_SESSION_EXPIRED"
  | "AUTH_ACCOUNT_CONFLICT"
  | "FINANCIAL_IDENTITY_REQUIRED"
  | "FINANCIAL_WALLET_CHANGE_REQUIRES_REAUTH"
  | "WALLET_SIGNATURE_REQUIRED"
  | "ZAMA_AUTHORIZATION_REQUIRED"
  | "UNKNOWN";

export type LeopoldError = { code: LeopoldErrorCode; message: string; technicalDetail?: string };

const messages: Record<LeopoldErrorCode, string> = {
  WRONG_NETWORK: "Switch to Sepolia to continue.",
  INSUFFICIENT_ETH: "You need Sepolia ETH for gas and the refundable bond.",
  INSUFFICIENT_USDC: "Get test USDC first.",
  RELAYER_UNAVAILABLE: "Private processing is temporarily unavailable. Your funds remain onchain.",
  CONFIGURATION_MISSING: "This Leopold deployment is not configured yet.",
  ROUND_CLOSED: "This prize round has already closed.",
  USER_REJECTED: "The wallet request was declined.",
  RPC_FAILURE: "Sepolia is temporarily unreachable. Try again shortly.",
  UNSUPPORTED_WALLET: "No compatible browser wallet was found.",
  PRIVATE_LIQUIDITY_UNAVAILABLE: "This withdrawal is temporarily unavailable from the vault’s private liquid balance.",
  AUTH_CONFIGURATION_REQUIRED: "Leopold authentication is not configured in this environment.",
  AUTH_SESSION_EXPIRED: "Your Leopold session expired. Sign in again.",
  AUTH_ACCOUNT_CONFLICT: "Resolve the account credential conflict before continuing.",
  FINANCIAL_IDENTITY_REQUIRED: "Complete your Leopold account and link your financial wallet before continuing.",
  FINANCIAL_WALLET_CHANGE_REQUIRES_REAUTH: "The verified financial wallet cannot be replaced automatically.",
  WALLET_SIGNATURE_REQUIRED: "Sign with your external wallet to verify ownership before continuing.",
  ZAMA_AUTHORIZATION_REQUIRED: "Authorize this wallet again before revealing private financial data.",
  UNKNOWN: "Something went wrong. No funds were moved.",
};

export function classifyLeopoldError(error: unknown): LeopoldError {
  const detail = error instanceof Error ? error.message : String(error);
  const lower = detail.toLowerCase();
  let code: LeopoldErrorCode = "UNKNOWN";
  if (detail.startsWith("CONFIGURATION_MISSING")) code = "CONFIGURATION_MISSING";
  else if (/user rejected|rejected request|4001/u.test(lower)) code = "USER_REJECTED";
  else if (/wrong chain|chain mismatch|unsupported chain/u.test(lower)) code = "WRONG_NETWORK";
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
  else if (/zama_authorization_required/u.test(lower)) code = "ZAMA_AUTHORIZATION_REQUIRED";
  else if (/rpc|network|fetch/u.test(lower)) code = "RPC_FAILURE";
  return { code, message: messages[code], technicalDetail: detail.slice(0, 500) };
}
