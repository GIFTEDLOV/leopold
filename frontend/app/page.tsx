import { MarketingHome } from "@/components/marketing/marketing-home";

export default function HomePage() {
  return (
    <>
      <style>{`
        html,
        body {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        html::-webkit-scrollbar,
        body::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
      `}</style>
      <MarketingHome />
    </>
  );
}
