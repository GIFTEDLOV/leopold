import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { WalletGate } from "@/components/wallet-gate";

export default function FinancialLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <WalletGate>{children}</WalletGate>
    </AppShell>
  );
}
