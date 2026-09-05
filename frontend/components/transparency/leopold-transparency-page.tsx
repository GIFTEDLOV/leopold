import Link from "next/link";
import { ThemeToggle } from "../theme-toggle";
import styles from "./leopold-transparency-page.module.css";

const confidential = ["Individual savings positions", "Exact prize weight and odds", "Encrypted random ticket", "Winner and winnings"];
const publicFacts = ["Prize-round entry and public ETH bond", "Initial amount at the Make Private boundary", "Aggregate vault strategy and Compound position", "Round and finalization state"];

function Facts({ dark, title, items, tag }: { dark?: boolean; title: string; items: string[]; tag: string }) {
  return <article className={dark ? styles.dark : undefined}><p>{dark ? "PRIVATE ENCRYPTED STATE" : "PUBLIC PROTOCOL STATE"}</p><h2>{title}</h2>{items.map((item, index) => <div key={item}><b>{String(index + 1).padStart(2, "0")}</b><span>{item}</span><i>{tag}</i></div>)}</article>;
}

export function LeopoldTransparencyPage() {
  return <main className={styles.page}><header className={styles.header}><Link href="/"><i className={styles.mark} aria-hidden="true"/><span>Leop<span>old</span></span></Link><nav><Link href="/transparency">Transparency</Link><Link href="/ops">Protocol status</Link><ThemeToggle/><Link className={styles.open} href="/app">Open app</Link></nav></header><section className={styles.hero}><p>PROTOCOL TRANSPARENCY</p><h1>Publicly verifiable.<br/><em>Privately held.</em></h1><span>Leopold separates public protocol facts from encrypted user state. This page states that boundary plainly.</span></section><section className={styles.split}><Facts dark title="What stays yours." items={confidential} tag="ENCRYPTED"/><Facts title="What anyone can verify." items={publicFacts} tag="PUBLIC"/></section><section className={styles.protocol}><div><p>OFFICIAL PROTOCOL</p><h2>Four vaults. One confidential savings system.</h2></div><div className={styles.cards}>{["Daily · 24 hours","Weekly · 7 days","Monthly · 30 days","Boost · 7 days"].map(item=><article key={item}><span>OFFICIAL VAULT</span><strong>{item}</strong><small>Address loads from deployment configuration</small></article>)}</div></section><section className={styles.limit}><p>KNOWN PRIVACY LIMITS</p><h2>Confidentiality is not anonymity.</h2><span>Wallet addresses, transaction timing, public prize entry and the wrapper boundary remain observable. Aggregate vault activity may be public, and low participation can enable inference. A user’s own browser can see values they deliberately reveal.</span><Link href="/app/help">Read the Leopold guide ↗</Link></section></main>;
}
