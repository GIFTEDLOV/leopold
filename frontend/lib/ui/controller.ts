import type { AccountStatus } from "@/lib/auth/account-state";
import type { WalletSessionState } from "@/lib/auth/wallet-identity";
import type { VaultId } from "@/lib/leopold/config";
import type { PrivateBalanceStatus } from "@/lib/leopold/private-balance";
import type { TransactionStage } from "@/lib/leopold/transactions";
import type { HealthState, PublicHealth } from "@/lib/ops/health";
import { HttpReadError, withReadReliability } from "@/lib/ops/reliability";
import { SETTLED_ROUND_STATE } from "@/lib/leopold/reads";

export type UiAccountState = "loading" | "signed-out" | "profile-incomplete" | "ready";
export type UiWalletState = "disconnected" | "connecting" | "connected" | "wrong-network" | "error";
export type UiPrivateValueState = "hidden" | "revealing" | "revealed" | "reveal-failed";
export type UiTransactionState =
  | "idle"
  | "awaiting-signature"
  | "submitted"
  | "confirming"
  | "private-processing"
  | "success"
  | "failure";
export type UiVaultState = "open" | "entered" | "closed" | "settling" | "settled" | "unavailable";
export type UiServiceState = "healthy" | "degraded" | "unavailable" | "unknown";
export type UiDataClassification = "PUBLIC" | "USER_PRIVATE" | "INTERNAL_ONLY";

export const LEOPOLD_RECOMMENDED_VAULT: VaultId = "weekly";

export function isRecommendedVault(vault: VaultId): boolean {
  return vault === LEOPOLD_RECOMMENDED_VAULT;
}

export const LEOPOLD_UI_DATA_POLICY = {
  PUBLIC: [
    "round timestamps and public state",
    "public prize reserve",
    "vault names and official deployment addresses",
    "service health and release status",
    "public transaction hashes and lifecycle",
  ],
  USER_PRIVATE: [
    "verified email and username for the signed-in user",
    "current user's financial-wallet association",
    "private USDC and private vault savings after an explicit reveal",
    "private prize result and winnings after an explicit reveal",
  ],
  INTERNAL_ONLY: [
    "raw ciphertext handles and encrypted input proofs",
    "authentication and refresh tokens",
    "decryption material and signed decrypt payloads",
    "provider user identifiers and wallet-to-email lookup data",
    "Dynamic, Wagmi, Zama relayer, FHE ACL, TWAB, HCU, and settlement-chunk internals",
  ],
} as const satisfies Record<UiDataClassification, readonly string[]>;

const INTERNAL_ONLY_UI_KEYS = new Set([
  "authToken",
  "accessToken",
  "refreshToken",
  "ciphertext",
  "ciphertextHandle",
  "decryptionKey",
  "decryptionMaterial",
  "dynamicConnector",
  "dynamicUser",
  "encryptedHandle",
  "fheProof",
  "privateBalanceDiagnostic",
  "privateBalanceHandle",
  "privateEligibility",
  "providerUserId",
  "rawProof",
  "technicalDetail",
  "wagmiConnector",
]);

export function assertUiControllerSafety(value: unknown, path = "controller"): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertUiControllerSafety(item, `${path}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (INTERNAL_ONLY_UI_KEYS.has(key)) throw new Error(`INTERNAL_ONLY_UI_FIELD:${path}.${key}`);
    if (typeof item !== "function") assertUiControllerSafety(item, `${path}.${key}`);
  }
}

export function mapAccountState(status: AccountStatus): UiAccountState {
  if (status === "AUTH_LOADING") return "loading";
  if (status === "SIGNED_OUT") return "signed-out";
  if (status === "SIGNED_IN_PROFILE_INCOMPLETE") return "profile-incomplete";
  return "ready";
}

export function mapWalletState(status: WalletSessionState): UiWalletState {
  if (status === "BOOTSTRAPPING" || status === "CONNECTING") return "connecting";
  if (status === "CONNECTED") return "connected";
  if (status === "WRONG_NETWORK") return "wrong-network";
  if (status === "ERROR") return "error";
  return "disconnected";
}

export function mapPrivateValueState(status: PrivateBalanceStatus, revealed: boolean): UiPrivateValueState {
  if (status === "READING_HANDLE" || status === "AWAITING_DECRYPT_AUTHORIZATION" || status === "DECRYPTING") {
    return "revealing";
  }
  if (status === "REVEAL_FAILED") return "reveal-failed";
  if (status === "REVEALED" && revealed) return "revealed";
  return "hidden";
}

const SIGNATURE_STAGES = new Set<TransactionStage>([
  "wallet",
  "approval-signature",
  "wrap-signature",
  "save-signature",
  "withdraw-round-advance-signature",
  "withdraw-signature",
]);
const SUBMITTED_STAGES = new Set<TransactionStage>([
  "submitted",
  "approval-submitted",
  "wrap-submitted",
  "save-submitted",
  "withdraw-round-advance-submitted",
  "withdraw-submitted",
]);

export function mapTransactionState(stage: TransactionStage): UiTransactionState {
  if (stage === "ready") return "idle";
  if (stage === "complete") return "success";
  if (stage === "failed") return "failure";
  if (stage === "private" || stage === "save-encrypting") return "private-processing";
  if (SIGNATURE_STAGES.has(stage)) return "awaiting-signature";
  if (SUBMITTED_STAGES.has(stage)) return "submitted";
  return "confirming";
}

export function mapVaultState(input: {
  contractState: number | undefined;
  depositOpen: boolean;
  entered: boolean;
}): UiVaultState {
  if (input.contractState === undefined) return "unavailable";
  if (input.contractState === SETTLED_ROUND_STATE) return "settled";
  if (input.contractState >= 2) return "settling";
  if (input.contractState === 1 && input.depositOpen) return input.entered ? "entered" : "open";
  return "closed";
}

export function mapServiceState(state: HealthState): UiServiceState {
  if (state === "HEALTHY") return "healthy";
  if (state === "DEGRADED") return "degraded";
  if (state === "UNAVAILABLE") return "unavailable";
  return "unknown";
}

export type UiHealthSnapshot = {
  state: UiServiceState;
  checkedAt: string;
  assurance: string;
  network: { state: UiServiceState; chainId: 11155111; latestBlock: string | null; message: string };
  zama: { state: UiServiceState; message: string };
  dynamic: { state: UiServiceState; message: string };
  deployment: {
    state: UiServiceState;
    registry: string | null;
    lcUsdc: string | null;
    vaults: Array<{ name: string; address: string | null; hasCode: boolean }>;
  };
  release: PublicHealth["release"];
};

export function mapPublicHealth(health: PublicHealth): UiHealthSnapshot {
  return {
    state: mapServiceState(health.state),
    checkedAt: health.checkedAt,
    assurance: health.assurance,
    network: {
      state: mapServiceState(health.network.state),
      chainId: health.network.chainId,
      latestBlock: health.network.latestBlock,
      message: health.network.message,
    },
    zama: { state: mapServiceState(health.zama.state), message: health.zama.message },
    dynamic: { state: mapServiceState(health.dynamic.state), message: health.dynamic.message },
    deployment: {
      state: mapServiceState(health.deployment.state),
      registry: health.deployment.registry,
      lcUsdc: health.deployment.lcUsdc,
      vaults: health.deployment.vaults,
    },
    release: health.release,
  };
}

export async function readUiHealth(fetchFn: typeof fetch = fetch): Promise<UiHealthSnapshot> {
  return withReadReliability(
    async ({ signal }) => {
      const response = await fetchFn("/api/health", {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal,
      });
      if (!response.ok) throw new HttpReadError(response.status);
      return mapPublicHealth((await response.json()) as PublicHealth);
    },
    { operation: "HEALTH_CHECK" },
  );
}
