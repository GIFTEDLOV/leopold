export type V2EntryStatusKind = "registered" | "scheduled" | "off" | "unknown";

export type V2EntryStatus = {
  kind: V2EntryStatusKind;
  label: string;
  message: string;
};

/**
 * Keep consumer-facing entry copy aligned across the V2 home, draws, and activity views.
 * A registration read takes precedence over the preference because an opted-out user
 * remains in a draw they already entered.
 */
export function getV2EntryStatus(
  registered: boolean | null | undefined,
  autoEntryEnabled: boolean | null | undefined,
): V2EntryStatus {
  if (registered === true) {
    return {
      kind: "registered",
      label: "You're entered",
      message: "You're entered in the current draw.",
    };
  }
  if (registered === false && autoEntryEnabled === true) {
    return {
      kind: "scheduled",
      label: "Starts next eligible draw",
      message: "Starts next eligible draw.",
    };
  }
  if (registered === false && autoEntryEnabled === false) {
    return {
      kind: "off",
      label: "Prize Savings is off",
      message: "Prize Savings is off.",
    };
  }
  return {
    kind: "unknown",
    label: "Checking",
    message: "Checking your Prize Savings status.",
  };
}
