import { execFileSync } from "node:child_process";

const SHA = /^[0-9a-f]{40}$/u;

export type GitProvenance = {
  readonly branch: string;
  readonly commit: string;
  readonly tree: string;
  readonly clean: boolean;
};

export function readGitProvenance(root: string): GitProvenance {
  const git = (args: readonly string[]) => execFileSync("git", [...args], { cwd: root, encoding: "utf8" }).trim();
  const status = git(["status", "--porcelain", "--untracked-files=all"]);
  return {
    branch: git(["branch", "--show-current"]),
    commit: git(["rev-parse", "HEAD"]),
    tree: git(["rev-parse", "HEAD^{tree}"]),
    clean: status.length === 0,
  };
}

export function assertReviewedProvenance(
  provenance: GitProvenance,
  expectedCommit: string,
  expectedBranch?: string,
): void {
  if (!SHA.test(expectedCommit)) throw new Error("LEOPOLD_REVIEWED_SOURCE_SHA must be a full 40-character SHA");
  if (!provenance.clean) throw new Error("Disposable deployment requires a clean reviewed worktree");
  if (provenance.commit !== expectedCommit) {
    throw new Error(`Disposable deployment HEAD ${provenance.commit} does not match reviewed SHA ${expectedCommit}`);
  }
  if (expectedBranch !== undefined && provenance.branch !== expectedBranch) {
    throw new Error(`Disposable deployment branch ${provenance.branch} does not match ${expectedBranch}`);
  }
}
