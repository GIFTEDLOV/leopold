import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">L</span>Leopold
        </Link>
        <Link className="button secondary small" href="/app">
          Open app
        </Link>
      </nav>
      <section className="how" style={{ borderTop: 0 }}>
        <div className="how-inner">
          <span className="eyebrow">Privacy policy</span>
          <h1>Privacy at Leopold.</h1>
          <article className="card section">
            <p>
              Leopold uses external authentication providers such as Dynamic to help you sign in and connect your
              external wallet. Dynamic may process your email, username, wallet address, linked social credentials, and
              session metadata to provide those services.
            </p>
            <p>
              Leopold does not send confidential financial plaintext to Dynamic. This includes private balances, TWAB,
              private odds, private winnings, and decrypted results. Your external wallet remains under your control and
              is used for wallet authorization and blockchain transactions.
            </p>
            <p>
              Public blockchain activity remains publicly observable. Prize-round registration and the settlement bond
              are public. Aggregate strategy activity may be public, and the initial shield/unshield boundaries may
              expose public token amounts. These limits mean Leopold provides confidentiality for supported values, not
              complete anonymity.
            </p>
            <p>
              You retain control of your external wallets. Review the relevant provider and network disclosures before
              using the testnet application. Questions about this concise policy should be directed through the
              project’s published support channel.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
