// @vitest-environment jsdom

import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  connectVerifiedWallet: vi.fn(async () => ({ ok: true, state: "CONNECTED" })),
  state: {
    data: { roundId: 2n, latestResultRoundId: 1n, latestResultRound: [0n, 0n, 0, 0n, 0n, 0n, 0n, 0n] as const, automationCredit: 0n },
    readStatus: "ready",
    readError: null,
    readTransient: false,
    topologyError: false,
    action: { status: "idle", hashes: [], stage: "idle" },
    shouldShowWalletNotice: true,
    dialog: null,
    busy: false,
    now: 0n,
    nextDraw: 0n,
    prizeSavingsOn: false,
    entryStatus: { label: "Not entered" },
    drawStatus: { label: "Open", tone: "good" },
    entryBalanceLabel: "Checking",
    entryBalanceTone: "neutral",
    fundedDraws: null,
    resultReady: false,
    revealedSavingsValue: null,
    revealedResultValue: null,
    history: [],
    formatPrivateSavings: "•••••• USDC",
    load: vi.fn(),
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    setAmount: vi.fn(),
    setDraws: vi.fn(),
    submitDialog: vi.fn(),
    dismissAction: vi.fn(),
    revealSavings: vi.fn(),
    revealResult: vi.fn(),
    refreshHistory: vi.fn(),
  },
  walletSession: { status: "DISCONNECTED" },
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/components/final-ui/v2-functional-state", () => ({
  useV2FunctionalState: () => fixtures.state,
  v2FormatCountdown: () => "—",
  v2FormatDate: () => "—",
  v2StageLabel: () => "Working",
}));

vi.mock("@/components/wallet-identity-provider", () => ({
  useWalletIdentity: () => ({
    connectVerifiedWallet: fixtures.connectVerifiedWallet,
    walletSession: fixtures.walletSession,
  }),
}));

import { V2HomePage } from "@/components/final-ui/dashboard-experience";

const mutableState = fixtures.state as unknown as {
  action: { status: string; hashes: readonly string[]; stage?: string };
  readStatus: string;
  readError: string | null;
  readTransient: boolean;
  topologyError: boolean;
};

describe("V2 dashboard presentation connections", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mutableState.readStatus = "ready";
    mutableState.readError = null;
    mutableState.readTransient = false;
    mutableState.topologyError = false;
    mutableState.action = { status: "idle", hashes: [], stage: "idle" };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("connects the verified wallet in place without using login navigation", async () => {
    await act(async () => root.render(<V2HomePage />));

    const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === "Connect verified wallet");
    expect(button).toBeInstanceOf(HTMLButtonElement);

    await act(async () => (button as HTMLButtonElement).click());

    expect(fixtures.connectVerifiedWallet).toHaveBeenCalledTimes(1);
    expect(container.querySelector('a[href="/login"]')).toBeNull();
  });

  it("uses one spacing rule for standalone CTAs following dashboard copy", () => {
    const markup = renderToStaticMarkup(<V2HomePage />);
    const document = new DOMParser().parseFromString(markup, "text/html");
    const explore = Array.from(document.querySelectorAll("a")).find((link) => link.textContent?.trim() === "Explore Classic Vaults");
    const transparency = Array.from(document.querySelectorAll("a")).find((link) => link.textContent?.trim() === "Visit Transparency");

    expect(explore?.previousElementSibling?.textContent).toContain("Classic Vaults and Prize Savings balances always stay separate.");
    expect(transparency?.previousElementSibling?.textContent).toContain("Learn how your balance, draw entries, and results are protected.");

    const css = readFileSync(join(process.cwd(), "components/final-ui/dashboard-experience.module.css"), "utf8");
    expect(css).toContain(".panel > .panelCopy + .button,.panel > .homeFine + .button{margin-top:16px}");
  });

  it("does not render global action notices or transient read-failure banners", () => {
    mutableState.action = { status: "success", hashes: ["0xabc"], stage: "reconcile" };
    expect(renderToStaticMarkup(<V2HomePage />)).not.toContain("Your wallet activity was confirmed.");

    mutableState.action = { status: "running", hashes: [], stage: "reconcile" };
    expect(renderToStaticMarkup(<V2HomePage />)).not.toContain("Confirming in your wallet");

    mutableState.readStatus = "error";
    mutableState.readTransient = true;
    mutableState.readError = "RPC timeout";
    expect(renderToStaticMarkup(<V2HomePage />)).not.toContain("Prize Savings data needs attention.");
  });

  it("keeps a topology warning visible when the read is not transient", () => {
    mutableState.topologyError = true;
    expect(renderToStaticMarkup(<V2HomePage />)).toContain("Prize Savings data needs attention.");
  });
});
