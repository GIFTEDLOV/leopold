export type ActivityCategory = "deposit" | "withdrawal" | "prize" | "other";

export function activityCategoryForTransaction(kind: string): ActivityCategory {
  switch (kind) {
    case "get-test-usdc":
    case "make-private":
    case "save":
      return "deposit";
    case "withdraw":
    case "make-public":
      return "withdrawal";
    case "enter-round":
    case "claim-refund":
    case "claim-reward":
      return "prize";
    default:
      return "other";
  }
}
