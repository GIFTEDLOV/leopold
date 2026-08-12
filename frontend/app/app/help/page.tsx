const questions = [
  [
    "What is Private USDC?",
    "Private USDC is Leopold’s confidential form of canonical Circle USDC on Ethereum Sepolia. Your wallet can authorize a local reveal; the clear balance is not published onchain.",
  ],
  [
    "How do prizes work?",
    "Yield generated at the vault level funds prizes. Saving and prize entry are separate. Exact weights, the winner, and winnings remain private.",
  ],
  [
    "What is the refundable settlement bond?",
    "It is a public ETH bond, separate from savings. A fixed portion funds permissionless private draw finalization; unused collateral becomes refundable after the round.",
  ],
  [
    "When do my prize chances start?",
    "At your successful Enter Prize Round transaction. Earlier savings history does not count. Chances grow while savings remain in that vault.",
  ],
  [
    "Can I withdraw anytime?",
    "Yes. Principal withdrawals have no queue. A withdrawal can temporarily fail if the vault’s private liquid buffer is insufficient; there is no promised queue.",
  ],
  [
    "Are winners public?",
    "No. Leopold does not expose the winner, winner index, accepted ticket, or winner-dependent refund behavior.",
  ],
  [
    "Why does a draw sometimes take time to finalize?",
    "The private draw is permissionlessly finalized in bounded steps. The app summarizes this as Finalizing private draw.",
  ],
  [
    "How do I get test funds?",
    "Use Get Test USDC for canonical Circle Sepolia USDC. You also need Sepolia ETH from an external faucet for gas and the refundable bond.",
  ],
] as const;

export default function HelpPage() {
  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <h1>Help</h1>
          <p>Clear answers about private savings and prizes.</p>
        </div>
      </div>
      <article className="card qa">
        {questions.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </article>
    </div>
  );
}
