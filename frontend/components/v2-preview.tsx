"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, formatEther, formatUnits, type Address } from "viem";
import { sepolia } from "viem/chains";
import { useAccount } from "wagmi";
import {
  V2_PREVIEW_ADDRESSES,
  V2_PREVIEW_CADENCE,
  V2_PREVIEW_CANDIDATE_SHA,
  V2_PREVIEW_CHAIN_ID,
  V2_PREVIEW_RUNTIME_HASHES,
  V2_PREVIEW_SG4_BINDING_DIGEST,
} from "@/lib/leopold/v2-preview-config";
import { createLeopoldSepoliaPublicTransport } from "@/lib/leopold/network";
import {
  v2AdapterPreviewAbi,
  v2CometPreviewAbi,
  v2EscrowPreviewAbi,
  v2VaultPreviewAbi,
} from "@/lib/leopold/v2-preview-abis";
import { erc20Abi } from "@/lib/leopold/abis";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: createLeopoldSepoliaPublicTransport(10_000),
});

export const roundStateLabels = [
  "Uninitialized",
  "Open",
  "Aggregate pending",
  "Aggregate finalized",
  "Empty",
  "Candidate validity pending",
  "Candidate rejected",
  "Ticket accepted",
  "Winner processing",
  "Winnings allocated",
  "Settled",
  "Reconciliation pending",
  "Reconciliation failed",
  "Ready to allocate",
  "Allocation processing",
] as const;

export type PreviewReadState = {
  blockNumber: bigint;
  blockTimestamp: bigint;
  roundId: bigint;
  round: readonly [bigint, bigint, number, bigint, bigint, bigint, bigint, bigint];
  bondAmount: bigint;
  refundAmount: bigint;
  accountedLiability: bigint;
  totalAutomationCredit: bigint;
  totalRewardLiability: bigint;
  totalRefundLiability: bigint;
  accountingInvariantHolds: boolean;
  escrowBalance: bigint;
  topologyVerified: boolean;
  account: Address | null;
  usdcBalance: bigint | null;
  privateHandlesRead: boolean | null;
  autoEntryEnabled: boolean | null;
  effectiveRound: bigint | null;
  automationCredit: bigint | null;
  registered: boolean | null;
  refundClaimed: boolean | null;
  rewardCredit: bigint | null;
  escrowRound: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean] | null;
  latestResultRoundId: bigint | null;
  latestResultRound: readonly [bigint, bigint, number, bigint, bigint, bigint, bigint, bigint] | null;
  latestResultRegistered: boolean | null;
  latestResultRefundClaimed: boolean | null;
};

type LoadState = { status: "idle" | "loading" | "ready" | "error"; error?: string; data?: PreviewReadState };

function sameAddress(left: string, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatUsdc(value: bigint): string {
  return `${formatUnits(value, 6)} USDC`;
}

function formatDate(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1_000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function readTupleValue<T>(value: unknown, index: number): T {
  if (!Array.isArray(value)) throw new Error("PREVIEW_READ:malformed tuple");
  return value[index] as T;
}

export async function readPreviewState(account: Address | null): Promise<PreviewReadState> {
  const [chainId, block, roundId] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBlock({ blockTag: "finalized" }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.vault,
      abi: v2VaultPreviewAbi,
      functionName: "activeRoundId",
    }),
  ]);
  if (chainId !== V2_PREVIEW_CHAIN_ID) throw new Error(`PREVIEW_READ:wrong-chain-${chainId}`);

  const [
    round,
    bondAmount,
    refundAmount,
    accountedLiability,
    totalAutomationCredit,
    totalRewardLiability,
    totalRefundLiability,
    accountingInvariantHolds,
    escrowBalance,
    asset,
    underlying,
    strategy,
    vaultEscrow,
    adapterVault,
    adapterAsset,
    adapterComet,
    cometBaseToken,
    cometBaseScale,
    escrowRound,
    latestResultRound,
  ] = await Promise.all([
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.vault,
      abi: v2VaultPreviewAbi,
      functionName: "roundInfo",
      args: [roundId],
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowPreviewAbi,
      functionName: "BOND_AMOUNT",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowPreviewAbi,
      functionName: "REFUND_PER_COMPLETED_PARTICIPANT",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowPreviewAbi,
      functionName: "accountedLiability",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowPreviewAbi,
      functionName: "totalAutomationCredit",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowPreviewAbi,
      functionName: "totalRewardLiability",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowPreviewAbi,
      functionName: "totalRefundLiability",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowPreviewAbi,
      functionName: "accountingInvariantHolds",
    }),
    publicClient.getBalance({ address: V2_PREVIEW_ADDRESSES.escrow, blockTag: "finalized" }),
    publicClient.readContract({ address: V2_PREVIEW_ADDRESSES.vault, abi: v2VaultPreviewAbi, functionName: "ASSET" }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.vault,
      abi: v2VaultPreviewAbi,
      functionName: "UNDERLYING",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.vault,
      abi: v2VaultPreviewAbi,
      functionName: "STRATEGY",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.vault,
      abi: v2VaultPreviewAbi,
      functionName: "SETTLEMENT_BOND_ESCROW",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.adapter,
      abi: v2AdapterPreviewAbi,
      functionName: "vault",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.adapter,
      abi: v2AdapterPreviewAbi,
      functionName: "asset",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.adapter,
      abi: v2AdapterPreviewAbi,
      functionName: "COMET",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.comet,
      abi: v2CometPreviewAbi,
      functionName: "baseToken",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.comet,
      abi: v2CometPreviewAbi,
      functionName: "baseScale",
    }),
    publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowPreviewAbi,
      functionName: "roundInfo",
      args: [roundId],
    }),
    roundId > 1n
      ? publicClient.readContract({
          address: V2_PREVIEW_ADDRESSES.vault,
          abi: v2VaultPreviewAbi,
          functionName: "roundInfo",
          args: [roundId - 1n],
        })
      : Promise.resolve(null),
  ]);

  const accountReads = account
    ? await Promise.all([
        publicClient.readContract({
          address: V2_PREVIEW_ADDRESSES.vault,
          abi: v2VaultPreviewAbi,
          functionName: "principalOf",
          args: [account],
        }),
        publicClient.readContract({
          address: V2_PREVIEW_ADDRESSES.vault,
          abi: v2VaultPreviewAbi,
          functionName: "winningsOf",
          args: [account],
        }),
        publicClient.readContract({
          address: V2_PREVIEW_ADDRESSES.escrow,
          abi: v2EscrowPreviewAbi,
          functionName: "automationBondCredit",
          args: [account],
        }),
        publicClient.readContract({
          address: V2_PREVIEW_ADDRESSES.escrow,
          abi: v2EscrowPreviewAbi,
          functionName: "autoEntryPreference",
          args: [account],
        }),
        publicClient.readContract({
          address: V2_PREVIEW_ADDRESSES.escrow,
          abi: v2EscrowPreviewAbi,
          functionName: "isRegistered",
          args: [roundId, account],
        }),
        publicClient.readContract({
          address: V2_PREVIEW_ADDRESSES.escrow,
          abi: v2EscrowPreviewAbi,
          functionName: "refundClaimed",
          args: [roundId, account],
        }),
        publicClient.readContract({
          address: V2_PREVIEW_ADDRESSES.escrow,
          abi: v2EscrowPreviewAbi,
          functionName: "settlementRewardCredit",
          args: [account],
        }),
        publicClient.readContract({
          address: V2_PREVIEW_ADDRESSES.usdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        }),
      ])
    : null;

  const opensAt = readTupleValue<bigint>(round, 0);
  const closesAt = readTupleValue<bigint>(round, 1);
  const state = Number(readTupleValue<bigint | number>(round, 2));
  const preference = accountReads?.[3];
  const preferenceEnabled = preference ? Boolean(readTupleValue<boolean>(preference, 1)) : null;
  const effectiveRound = preference ? readTupleValue<bigint>(preference, 2) : null;
  const topologyVerified = [
    [asset, V2_PREVIEW_ADDRESSES.wrapper],
    [underlying, V2_PREVIEW_ADDRESSES.usdc],
    [strategy, V2_PREVIEW_ADDRESSES.adapter],
    [vaultEscrow, V2_PREVIEW_ADDRESSES.escrow],
    [adapterVault, V2_PREVIEW_ADDRESSES.vault],
    [adapterAsset, V2_PREVIEW_ADDRESSES.usdc],
    [adapterComet, V2_PREVIEW_ADDRESSES.comet],
    [cometBaseToken, V2_PREVIEW_ADDRESSES.usdc],
  ].every(([actual, expected]) => typeof actual === "string" && sameAddress(actual, expected));

  if (cometBaseScale !== 1_000_000n) throw new Error("PREVIEW_READ:wrong-comet-scale");
  if (opensAt >= closesAt) throw new Error("PREVIEW_READ:invalid-round-window");

  const latestResultRoundId = roundId > 1n ? roundId - 1n : null;
  const latestResultRegistered =
    latestResultRoundId === null || !accountReads ? null : await publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowPreviewAbi,
      functionName: "isRegistered",
      args: [latestResultRoundId, account as Address],
    });
  const latestResultRefundClaimed =
    latestResultRoundId === null || !accountReads ? null : await publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowPreviewAbi,
      functionName: "refundClaimed",
      args: [latestResultRoundId, account as Address],
    });
  const principalHandle = accountReads?.[0];
  const winningsHandle = accountReads?.[1];

  return {
    blockNumber: block.number,
    blockTimestamp: block.timestamp,
    roundId,
    round: [
      opensAt,
      closesAt,
      state,
      readTupleValue<bigint>(round, 3),
      readTupleValue<bigint>(round, 4),
      readTupleValue<bigint>(round, 5),
      readTupleValue<bigint>(round, 6),
      readTupleValue<bigint>(round, 7),
    ],
    bondAmount,
    refundAmount,
    accountedLiability,
    totalAutomationCredit,
    totalRewardLiability,
    totalRefundLiability,
    accountingInvariantHolds,
    escrowBalance,
    topologyVerified,
    account,
    usdcBalance: accountReads?.[7] ?? null,
    privateHandlesRead:
      accountReads ? !isZeroHandle(principalHandle) || !isZeroHandle(winningsHandle) : null,
    autoEntryEnabled: preferenceEnabled,
    effectiveRound,
    automationCredit: accountReads?.[2] ?? null,
    registered: accountReads?.[4] ?? null,
    refundClaimed: accountReads?.[5] ?? null,
    rewardCredit: accountReads?.[6] ?? null,
    escrowRound,
    latestResultRoundId,
    latestResultRound: latestResultRound
      ? [
          readTupleValue<bigint>(latestResultRound, 0),
          readTupleValue<bigint>(latestResultRound, 1),
          Number(readTupleValue<bigint | number>(latestResultRound, 2)),
          readTupleValue<bigint>(latestResultRound, 3),
          readTupleValue<bigint>(latestResultRound, 4),
          readTupleValue<bigint>(latestResultRound, 5),
          readTupleValue<bigint>(latestResultRound, 6),
          readTupleValue<bigint>(latestResultRound, 7),
        ]
      : null,
    latestResultRegistered,
    latestResultRefundClaimed,
  };
}

function isZeroHandle(handle: unknown): boolean {
  return typeof handle === "string" && /^0x0{64}$/iu.test(handle);
}

function StatusPill({ children, tone = "good" }: { children: React.ReactNode; tone?: "good" | "neutral" | "gold" }) {
  return <span className={`badge ${tone === "neutral" ? "neutral" : tone === "gold" ? "gold" : ""}`}>{children}</span>;
}

function ReadOnlyButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="button secondary" type="button" disabled title="No transactions are enabled in this preview">
      {children}
    </button>
  );
}

export function V2Preview() {
  const { address } = useAccount();
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", data: await readPreviewState(address ?? null) });
    } catch (error) {
      setState({ status: "error", error: error instanceof Error ? error.message : "Read-only Sepolia read failed" });
    }
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    readPreviewState(address ?? null).then(
      (data) => {
        if (!cancelled) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            error: error instanceof Error ? error.message : "Read-only Sepolia read failed",
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [address]);

  const data = state.data;
  const round = data?.round;
  const roundState = round ? (roundStateLabels[round[2]] ?? "Unknown") : "Checking";
  const roundOpen = Boolean(
    data && round && data.blockTimestamp >= round[0] && data.blockTimestamp < round[1] && round[2] === 1,
  );
  const nextEligible = data?.effectiveRound ?? (data ? data.roundId + 1n : null);

  return (
    <div className="content v2-preview" data-testid="v2-preview">
      <div className="v2-preview-hero">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Official V2 product preview · read-only</span>
            <h1>Private savings that keeps running.</h1>
            <p>
              See the adopted Daily V2 experience: private principal, automatic prize entry, and clear settlement
              status.
            </p>
          </div>
          <div className="v2-preview-hero-status">
            <StatusPill>Sepolia</StatusPill>
            <StatusPill tone="neutral">No transactions</StatusPill>
          </div>
        </div>
        <div className="status-banner fixture" role="status">
          <span aria-hidden="true">i</span>
          <div>
            <strong>Live read-only preview</strong>
            <p>
              On-chain state is read from the adopted V2 topology. This page does not trigger participant, keeper, or
              wallet actions.
            </p>
          </div>
          <button
            className="button secondary small"
            type="button"
            onClick={() => void load()}
            disabled={state.status === "loading"}
          >
            {state.status === "loading" ? "Refreshing…" : "Refresh reads"}
          </button>
        </div>
      </div>

      {state.status === "error" ? (
        <div className="error" role="alert">
          <strong>Live V2 reads unavailable</strong>
          <p>{state.error}</p>
          <span className="subtle">The preview does not substitute fixture or historical V1 state.</span>
        </div>
      ) : null}

      <section className="grid three" aria-label="Private savings overview">
        <article className="card hero-stat v2-private-card">
          <div className="card-label">Private savings balance</div>
          <div className="stat">•••••• USDC</div>
          <div className="v2-stat-row">
            <StatusPill tone="neutral">Encrypted</StatusPill>
            <span className="subtle">
              {data?.privateHandlesRead === true
                ? "Handle read; value stays encrypted"
                : data
                  ? "Connect wallet for private state"
                  : "Revealed only by the rightful wallet"}
            </span>
          </div>
          <ReadOnlyButton>Reveal privately</ReadOnlyButton>
        </article>
        <article className="card hero-stat">
          <div className="card-label">Prize Savings</div>
          <div className="stat">
            {data?.autoEntryEnabled === null || !data ? "Connect wallet" : data.autoEntryEnabled ? "ON" : "OFF"}
          </div>
          <div className="v2-stat-row">
            <StatusPill tone={data?.autoEntryEnabled ? "good" : "neutral"}>
              {data?.autoEntryEnabled ? "Auto-entry scheduled" : "Next-round setting"}
            </StatusPill>
          </div>
          <span className="subtle">Changes take effect at a round boundary.</span>
        </article>
        <article className="card hero-stat">
          <div className="card-label">Automation credit</div>
          <div className="stat">
            {data?.automationCredit === null || data?.automationCredit === undefined
              ? "••••••"
              : formatEther(data.automationCredit)}{" "}
            ETH
          </div>
          <span className="subtle">Prepaid bond credit for automatic registration.</span>
        </article>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Daily V2 round</h2>
          <StatusPill tone={roundOpen ? "good" : "gold"}>{roundOpen ? "Open" : roundState}</StatusPill>
        </div>
        <div className="grid four v2-round-grid">
          <article className="card">
            <div className="card-label">Current round</div>
            <div className="stat">{data ? `#${data.roundId}` : "—"}</div>
            <span className="subtle">
              {round ? `${formatDate(round[0])} → ${formatDate(round[1])}` : "Reading finalized state"}
            </span>
          </article>
          <article className="card">
            <div className="card-label">Effective round</div>
            <div className="stat">{data?.effectiveRound ? `#${data.effectiveRound}` : "—"}</div>
            <span className="subtle">Auto-entry preference boundary</span>
          </article>
          <article className="card">
            <div className="card-label">Next eligible round</div>
            <div className="stat">{nextEligible ? `#${nextEligible}` : "—"}</div>
            <span className="subtle">No per-round action required</span>
          </article>
          <article className="card">
            <div className="card-label">Participant status</div>
            <div className="stat">
              {data?.registered === null || !data ? "Connect wallet" : data.registered ? "Entered" : "Not entered"}
            </div>
            <span className="subtle">Identity remains the connected wallet</span>
          </article>
        </div>
      </section>

      <section className="section detail-layout">
        <div className="grid">
          <article className="card v2-vault-card">
            <div className="vault-head">
              <div>
                <span className="subtle">Private savings vault</span>
                <h2>Daily</h2>
              </div>
              <StatusPill>{V2_PREVIEW_CADENCE.label}</StatusPill>
            </div>
            <p className="privacy-callout">
              Deposit privately, keep your principal private, and let the keeper handle the round lifecycle.
            </p>
            <div className="list-row">
              <div className="list-main">
                <strong>Prize Savings</strong>
                <span>Automatic entry is scheduled independently of saving.</span>
              </div>
              <StatusPill tone="neutral">No manual entry</StatusPill>
            </div>
            <div className="list-row">
              <div className="list-main">
                <strong>Round state</strong>
                <span>Public timing and settlement progress only.</span>
              </div>
              <strong>{roundState}</strong>
            </div>
            <div className="form-row">
              <ReadOnlyButton>Save privately</ReadOnlyButton>
              <ReadOnlyButton>Set Prize Savings</ReadOnlyButton>
            </div>
            <p className="subtle">
              Preview actions are disabled. Wallet write flows remain a separate product decision.
            </p>
          </article>
          <article className="card">
            <div className="section-title">
              <h2>Prize result</h2>
              <StatusPill tone="neutral">Private</StatusPill>
            </div>
            <div className="stat">Hidden</div>
            <p className="subtle">
              The result becomes revealable only after the private draw settles and only to the rightful wallet.
            </p>
            <ReadOnlyButton>Reveal private result</ReadOnlyButton>
            <div className="disclosure">
              Accepted random tickets, FHE handles, and participant balances are never displayed in the UI.
            </div>
          </article>
        </div>
        <aside className="grid">
          <article className="card">
            <div className="section-title">
              <h2>Refunds &amp; rewards</h2>
              <StatusPill tone="neutral">Read-only</StatusPill>
            </div>
            <div className="list-row">
              <div className="list-main">
                <strong>Bond refund</strong>
                <span>{data?.refundClaimed ? "Claimed" : "Available after settlement"}</span>
              </div>
              <span>{data ? formatEther(data.refundAmount) : "—"} ETH</span>
            </div>
            <div className="list-row">
              <div className="list-main">
                <strong>Settlement reward</strong>
                <span>Permissionless draw work credit</span>
              </div>
              <span>
                {data?.rewardCredit === null || data?.rewardCredit === undefined
                  ? "—"
                  : `${formatEther(data.rewardCredit)} ETH`}
              </span>
            </div>
            <div className="form-row">
              <ReadOnlyButton>Claim refund</ReadOnlyButton>
              <ReadOnlyButton>Claim reward</ReadOnlyButton>
            </div>
          </article>
          <article className="card">
            <div className="section-title">
              <h2>Withdrawals</h2>
              <StatusPill tone="neutral">Wallet reveal required</StatusPill>
            </div>
            <div className="list-row">
              <div className="list-main">
                <strong>Principal</strong>
                <span>Withdraw to Private USDC after rightful reveal.</span>
              </div>
              <ReadOnlyButton>Withdraw</ReadOnlyButton>
            </div>
            <div className="list-row">
              <div className="list-main">
                <strong>Unused automation credit</strong>
                <span>Only unreserved credit can leave escrow.</span>
              </div>
              <ReadOnlyButton>Withdraw</ReadOnlyButton>
            </div>
          </article>
        </aside>
      </section>

      <section className="section grid two">
        <article className="card">
          <div className="section-title">
            <h2>Round &amp; escrow accounting</h2>
            <StatusPill tone={data?.accountingInvariantHolds ? "good" : "gold"}>
              {data?.accountingInvariantHolds ? "Invariant holds" : "Checking"}
            </StatusPill>
          </div>
          <div className="list-row">
            <div className="list-main">
              <strong>Participants</strong>
              <span>Current round public count</span>
            </div>
            <span>{round ? round[5].toString() : "—"}</span>
          </div>
          <div className="list-row">
            <div className="list-main">
              <strong>Public prize</strong>
              <span>Only the public round amount is shown</span>
            </div>
            <span>{round ? formatUsdc(round[4]) : "—"}</span>
          </div>
          <div className="list-row">
            <div className="list-main">
              <strong>Escrow balance</strong>
              <span>Backing bond and accounting liabilities</span>
            </div>
            <span>{data ? formatEther(data.escrowBalance) : "—"} ETH</span>
          </div>
          <div className="list-row">
            <div className="list-main">
              <strong>Accounted liabilities</strong>
              <span>Credit + unresolved + reward + refund</span>
            </div>
            <span>{data ? formatEther(data.accountedLiability) : "—"} ETH</span>
          </div>
          <div className="list-row">
            <div className="list-main">
              <strong>Automation / reward / refund liabilities</strong>
              <span>Public aggregate escrow buckets</span>
            </div>
            <span>
              {data
                ? `${formatEther(data.totalAutomationCredit)} / ${formatEther(data.totalRewardLiability)} / ${formatEther(data.totalRefundLiability)} ETH`
                : "—"}
            </span>
          </div>
          <div className="list-row">
            <div className="list-main">
              <strong>Round history</strong>
              <span>Previous settlement state remains immutable</span>
            </div>
            <span>{data?.escrowRound?.[7] ? "Finalized" : "In progress"}</span>
          </div>
        </article>
        <article className="card">
          <div className="section-title">
            <h2>V1 history stays separate</h2>
            <StatusPill tone="neutral">Preserved</StatusPill>
          </div>
          <p className="subtle">
            V1 principal, claims, rewards, and historical activity are retained as their own experience. This preview
            does not rewrite or migrate them.
          </p>
          <div className="form-row">
            <Link className="button secondary" href="/app/classic/activity">
              V1 activity
            </Link>
            <Link className="button secondary" href="/app/classic/rewards">
              V1 rewards
            </Link>
          </div>
          <p className="subtle">
            V2 is the current product model shown here; the existing V1 routes remain available for history.
          </p>
        </article>
      </section>

      <section className="section card v2-proof-card">
        <div className="section-title">
          <h2>Adopted V2 topology</h2>
          <StatusPill tone={data?.topologyVerified ? "good" : "gold"}>
            {data?.topologyVerified ? "Read-only verified" : "Checking"}
          </StatusPill>
        </div>
        <div className="grid two">
          <div className="config-list">
            <div>
              Vault <code>{shortAddress(V2_PREVIEW_ADDRESSES.vault)}</code>
            </div>
            <div>
              Escrow <code>{shortAddress(V2_PREVIEW_ADDRESSES.escrow)}</code>
            </div>
            <div>
              Wrapper <code>{shortAddress(V2_PREVIEW_ADDRESSES.wrapper)}</code>
            </div>
            <div>
              Adapter <code>{shortAddress(V2_PREVIEW_ADDRESSES.adapter)}</code>
            </div>
          </div>
          <div className="config-list">
            <div>
              Candidate <code>{V2_PREVIEW_CANDIDATE_SHA.slice(0, 12)}…</code>
            </div>
            <div>
              SG-4 binding <code>{V2_PREVIEW_SG4_BINDING_DIGEST.slice(0, 12)}…</code>
            </div>
            <div>
              Vault runtime <code>{V2_PREVIEW_RUNTIME_HASHES.vault.slice(0, 12)}…</code>
            </div>
            <div>
              Finalized read <code>{data ? `#${data.blockNumber}` : "—"}</code>
            </div>
          </div>
        </div>
        <p className="subtle">
          Official V2 Sepolia topology · candidate and provenance remain visible for review; no deployment or migration
          action is available from this page.
        </p>
      </section>
    </div>
  );
}
