import type { AccountStatus, FinancialWalletMetadataStatus } from "./account-state";
import type { WalletRpcHealthState, WalletSessionReason, WalletSessionState } from "./wallet-identity";

export type WalletGateMode =
  | "AUTH_LOADING"
  | "SIGNED_OUT"
  | "PROFILE_INCOMPLETE"
  | "FINANCIAL_METADATA_LOADING"
  | "FINANCIAL_METADATA_ERROR"
  | "APPLICATION";

export type LeopoldRecoveryAction =
  | "LINK_FINANCIAL_WALLET"
  | "CONNECT_VERIFIED_WALLET"
  | "CONFIRM_ACCOUNT_SELECTION"
  | "CANCEL_CONNECTION"
  | "SWITCH_TO_SEPOLIA"
  | "RETRY_PROVIDER"
  | "RETRY_NETWORK"
  | "NONE"
  | "ERROR";

export type LeopoldRecovery = {
  visible: boolean;
  action: LeopoldRecoveryAction;
  message: string;
  detail: string;
};

export function deriveWalletGateMode(
  accountStatus: AccountStatus,
  metadataStatus: FinancialWalletMetadataStatus,
): WalletGateMode {
  if (accountStatus === "AUTH_LOADING") return "AUTH_LOADING";
  if (accountStatus === "SIGNED_OUT") return "SIGNED_OUT";
  if (accountStatus === "SIGNED_IN_PROFILE_INCOMPLETE") return "PROFILE_INCOMPLETE";
  if (metadataStatus === "LOADING") return "FINANCIAL_METADATA_LOADING";
  if (metadataStatus === "ERROR" || metadataStatus === "UNAVAILABLE") return "FINANCIAL_METADATA_ERROR";
  return "APPLICATION";
}

export type RecoveryInputs = {
  accountStatus: AccountStatus;
  financialMetadataStatus: FinancialWalletMetadataStatus;
  walletSessionStatus: WalletSessionState;
  walletSessionReason: WalletSessionReason;
  networkHealth: WalletRpcHealthState;
};

const hiddenRecovery: LeopoldRecovery = { visible: false, action: "NONE", message: "", detail: "" };

export function deriveLeopoldRecovery(inputs: RecoveryInputs): LeopoldRecovery {
  if (
    inputs.accountStatus === "AUTH_LOADING" ||
    inputs.accountStatus === "SIGNED_OUT" ||
    inputs.accountStatus === "SIGNED_IN_PROFILE_INCOMPLETE" ||
    inputs.financialMetadataStatus === "LOADING"
  ) {
    return hiddenRecovery;
  }
  if (inputs.financialMetadataStatus === "ERROR" || inputs.financialMetadataStatus === "UNAVAILABLE") {
    return {
      visible: true,
      action: "ERROR",
      message: "Your verified financial-wallet metadata could not be resolved.",
      detail: "Financial actions remain paused. Your account metadata has not been changed.",
    };
  }
  if (inputs.financialMetadataStatus === "NONE") {
    return {
      visible: true,
      action: "LINK_FINANCIAL_WALLET",
      message: "Link your financial wallet to continue.",
      detail: "Leopold has no verified financial wallet for this account yet.",
    };
  }
  if (inputs.walletSessionStatus === "BOOTSTRAPPING") return hiddenRecovery;
  if (inputs.walletSessionStatus === "DISCONNECTED") {
    return {
      visible: true,
      action: "CONNECT_VERIFIED_WALLET",
      message: "Connect your verified financial wallet to continue.",
      detail: "Financial and private actions remain paused. Public Leopold information remains available.",
    };
  }
  if (inputs.walletSessionStatus === "CONNECTING") {
    const accountSelection = inputs.walletSessionReason === "ACCOUNT_SELECTION_REQUIRED";
    return {
      visible: true,
      action: accountSelection ? "CONFIRM_ACCOUNT_SELECTION" : "CANCEL_CONNECTION",
      message: accountSelection
        ? "Select your verified account in Rabby or MetaMask."
        : "Connecting your verified financial wallet…",
      detail: accountSelection
        ? "Leopold will not adopt another wallet account."
        : "This user-initiated connection attempt is verifying your provider, account, and network.",
    };
  }
  if (inputs.walletSessionStatus === "WRONG_NETWORK") {
    return {
      visible: true,
      action: "SWITCH_TO_SEPOLIA",
      message: "Switch to Ethereum Sepolia to continue.",
      detail: "No financial transaction will be attempted until your verified wallet is on Sepolia.",
    };
  }
  if (inputs.walletSessionStatus === "ERROR") {
    return {
      visible: true,
      action: "RETRY_PROVIDER",
      message: "Your wallet connection could not be completed.",
      detail: "The connection attempt ended safely. You can retry without refreshing the page.",
    };
  }
  if (inputs.walletSessionStatus === "CONNECTED") {
    if (
      inputs.networkHealth === "WALLET_RPC_UNAVAILABLE" ||
      inputs.networkHealth === "APP_RPC_UNAVAILABLE" ||
      inputs.networkHealth === "UNKNOWN"
    ) {
      return {
        visible: true,
        action: "RETRY_NETWORK",
        message:
          inputs.networkHealth === "WALLET_RPC_UNAVAILABLE"
            ? "Your wallet's Sepolia connection isn't working."
            : inputs.networkHealth === "APP_RPC_UNAVAILABLE"
              ? "Leopold's Sepolia service is currently unavailable."
              : "Network health could not be confirmed.",
        detail:
          inputs.networkHealth === "WALLET_RPC_UNAVAILABLE"
            ? "Your Leopold wallet session remains connected, but its Sepolia RPC is unavailable."
            : inputs.networkHealth === "APP_RPC_UNAVAILABLE"
              ? "Your wallet remains connected, but Leopold's public Sepolia service is unavailable."
              : "Your wallet remains connected while network health is retried.",
      };
    }
    return hiddenRecovery;
  }
  return {
    visible: true,
    action: "ERROR",
    message: "Leopold could not determine the required recovery action.",
    detail: "Financial actions remain paused. No wallet or network command was attempted.",
  };
}
