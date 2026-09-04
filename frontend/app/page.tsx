import { LeopoldMarketingHome } from "@/components/marketing/leopold-marketing-home";

export default function HomePage() {
  return (
    <>
      <LeopoldMarketingHome />
      <style>{`
        #product > a {
          color: #fffef9;
        }

        header a[href="/onboarding"] {
          color: #c0a464;
        }

        @media (max-width: 820px) {
          [class*="classic-vaults-heading"] {
            text-align: center !important;
          }
        }
      `}</style>
    </>
  );
}
