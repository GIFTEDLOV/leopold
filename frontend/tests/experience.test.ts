import { describe, expect, it, vi } from "vitest";
import {
  EXPERIENCE_STORAGE_KEY,
  V1_NAVIGATION,
  V2_NAVIGATION,
  experienceForPath,
  persistExperience,
  readStoredExperience,
  type AppExperience,
} from "../lib/ui/experience";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

describe("V1/V2 experience architecture", () => {
  it("defaults a new user to V2 without a stored preference", () => {
    expect(readStoredExperience(storage())).toBe("v2");
  });

  it("persists the selected experience offchain", () => {
    const current = storage();
    persistExperience(current, "v1");
    expect(current.setItem).toHaveBeenCalledWith(EXPERIENCE_STORAGE_KEY, "v1");
    expect(readStoredExperience(current)).toBe("v1");
  });

  it.each([
    ["v2", "/app"],
    ["v2", "/app/v2/draws"],
    ["v2", "/app/v2/activity"],
    ["v2", "/app/v2/rewards"],
    ["v1", "/app/classic"],
    ["v1", "/app/classic/vaults/weekly"],
    ["v1", "/app/vaults/weekly"],
  ] as const)("keeps %s data on its explicit route namespace: %s", (experience, pathname) => {
    expect(experienceForPath(pathname)).toBe(experience);
  });

  it("leaves shared profile neutral so its selected experience controls the next home", () => {
    expect(experienceForPath("/app/profile")).toBeNull();
  });

  it("has a V2-only shell with one home and no Classic Vault destination", () => {
    expect(V2_NAVIGATION.map(([, href]) => href)).toEqual([
      "/app",
      "/app/v2/draws",
      "/app/v2/activity",
      "/app/v2/rewards",
      "/app/profile",
    ]);
    expect(V2_NAVIGATION.filter(([, href]) => href === "/app")).toHaveLength(1);
    expect(V2_NAVIGATION.some(([label]) => /classic|vault/i.test(label))).toBe(false);
  });

  it("has a complete V1 shell with the four classic vault destinations", () => {
    expect(V1_NAVIGATION.map(([label]) => label)).toEqual([
      "Home",
      "Vaults",
      "Prizes",
      "Activity",
      "Rewards",
      "Profile",
    ]);
    expect(V1_NAVIGATION.map(([, href]) => href)).toContain("/app/classic/vaults");
  });

  it("switching is only a local preference and has no wallet or contract write surface", () => {
    const walletWrite = vi.fn();
    const current = storage();
    const next: AppExperience = "v1";
    persistExperience(current, next);
    expect(walletWrite).not.toHaveBeenCalled();
    expect(readStoredExperience(current)).toBe("v1");
  });
});
