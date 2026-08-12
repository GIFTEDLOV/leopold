import Link from "next/link";
export default function LoginPage() {
  return (
    <main className="landing">
      <div className="wallet-gate">
        <span className="brand-mark">L</span>
        <h2>Wallet access only</h2>
        <p>
          Email, username, and social authentication are intentionally not part of this phase. Your wallet is the
          financial account boundary.
        </p>
        <Link className="button" href="/app">
          Connect Wallet
        </Link>
      </div>
    </main>
  );
}
