import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leopold — Private Prize Savings",
  description: "Save privately. Win privately. Withdraw anytime.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="bg-paper">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
