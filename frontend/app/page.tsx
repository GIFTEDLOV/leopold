import { LeopoldMarketingHome } from "@/components/marketing/leopold-marketing-home";

export default function HomePage() {
  return (
    <>
      <LeopoldMarketingHome />
      <style>{`
        #product > a {
          color: #fffef9;
        }

        header a[href="/app"] {
          color: #c0a464;
        }
      `}</style>
    </>
  );
}
