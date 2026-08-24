import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leopold — Private Prize Savings",
  description: "Save privately. Win privately. Withdraw anytime.",
  icons: {
    icon: "/marketing/leopold/leopold-monogram.png",
  },
  openGraph: {
    title: "Leopold — Private Prize Savings",
    description: "Save privately. Win privately. Withdraw anytime.",
    images: ["/marketing/leopold/leopold-og.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'try{var t=localStorage.getItem("leopold-theme");if(t==="dark"||t==="light")document.documentElement.dataset.leopoldTheme=t}catch(e){}' }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
