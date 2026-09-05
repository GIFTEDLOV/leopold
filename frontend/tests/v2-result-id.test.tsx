import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const state = {
  data: {
    roundId: 2n,
    latestResultRoundId: 1n,
    latestResultRound: [1788277728n, 1788277728n, 10, 0n, 0n, 0n, 0n, 0n] as const,
    automationCredit: 0n,
  },
  drawStatus: { label: "Open", tone: "good" },
  nextDraw: 1788277728n,
  prizeSavingsOn: false,
  entryStatus: { label: "Not entered" },
  resultReady: false,
  revealedResultValue: null,
  shouldShowWalletNotice: false,
  dialog: null,
  revealResult: vi.fn(),
};

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/components/final-ui/v2-functional-state", () => ({
  useV2FunctionalState: () => state,
  v2FormatCountdown: () => "—",
  v2FormatDate: () => "—",
  v2StageLabel: () => "Working",
}));

vi.mock("@/components/wallet-identity-provider", () => ({
  useWalletIdentity: () => ({ connectVerifiedWallet: vi.fn() }),
}));

import { V2DrawsPage } from "@/components/final-ui/dashboard-experience";

describe("V2 result round presentation", () => {
  it("uses latestResultRoundId instead of the round tuple timestamp", () => {
    const markup = renderToStaticMarkup(<V2DrawsPage />);

    expect(markup).toContain("Draw #1");
    expect(markup).not.toContain("Draw #1788277728");
  });
});
