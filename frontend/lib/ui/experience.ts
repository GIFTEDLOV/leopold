export type AppExperience = "v2" | "v1";

export const EXPERIENCE_STORAGE_KEY = "leopold.app-experience.v1";
export const V2_ADD_MONEY_EVENT = "leopold:open-v2-add-money";

export const V2_NAVIGATION = [
  ["Home", "/app", "⌂"],
  ["Draws / Results", "/app/v2/draws", "◇"],
  ["Activity", "/app/v2/activity", "↗"],
  ["Rewards / Returns", "/app/v2/rewards", "✦"],
  ["Profile", "/app/profile", "◎"],
] as const;

export const V1_NAVIGATION = [
  ["Home", "/app/classic", "⌂"],
  ["Vaults", "/app/classic/vaults", "▥"],
  ["Prizes", "/app/classic/prizes", "◇"],
  ["Activity", "/app/classic/activity", "↗"],
  ["Rewards", "/app/classic/rewards", "✦"],
  ["Profile", "/app/profile", "◎"],
] as const;

/** Explicit route namespaces are also used for legacy links so a shell can never mix product data models. */
export function experienceForPath(pathname: string): AppExperience | null {
  if (
    pathname === "/app" ||
    pathname === "/app/prize-savings" ||
    pathname === "/app/v2" ||
    pathname.startsWith("/app/v2/")
  ) {
    return "v2";
  }
  if (
    pathname === "/app/classic" ||
    pathname.startsWith("/app/classic/") ||
    pathname === "/app/vaults" ||
    pathname.startsWith("/app/vaults/") ||
    pathname === "/app/prizes" ||
    pathname.startsWith("/app/prizes/") ||
    pathname === "/app/activity" ||
    pathname === "/app/rewards"
  ) {
    return "v1";
  }
  return null;
}

export function readStoredExperience(storage: Pick<Storage, "getItem"> | null | undefined): AppExperience {
  try {
    return storage?.getItem(EXPERIENCE_STORAGE_KEY) === "v1" ? "v1" : "v2";
  } catch {
    return "v2";
  }
}

export function persistExperience(
  storage: Pick<Storage, "setItem"> | null | undefined,
  experience: AppExperience,
): void {
  try {
    storage?.setItem(EXPERIENCE_STORAGE_KEY, experience);
  } catch {
    // A blocked localStorage must not block navigation or cause a wallet action.
  }
}
