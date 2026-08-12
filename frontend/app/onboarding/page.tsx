import Link from "next/link";
export default function OnboardingPage() {
  return (
    <main className="landing">
      <div className="wallet-gate">
        <span className="brand-mark">L</span>
        <h2>Start with your wallet</h2>
        <p>Connect, switch to Ethereum Sepolia, get test USDC, then make it private. No profile setup is required.</p>
        <Link className="button" href="/app">
          Start Saving
        </Link>
      </div>
    </main>
  );
}
