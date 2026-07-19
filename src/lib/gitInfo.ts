import { execSync } from "node:child_process";

export interface GitInfo {
  /** Short commit hash, e.g. "a3f9c1e", or null outside a git checkout. */
  hash: string | null;
  /** Commit date as YYYY-MM-DD, or null. */
  date: string | null;
  /** Current branch name, or null. */
  branch: string | null;
  /** GitHub commit URL if an origin remote points at GitHub, else null. */
  url: string | null;
  /** GitHub repository URL if derivable, else null. */
  repoUrl: string | null;
}

function git(args: string): string | null {
  try {
    return (
      execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim() || null
    );
  } catch {
    return null;
  }
}

function githubRepoUrl(): string | null {
  const remote = git("remote get-url origin");
  if (!remote) return null;
  // Match both git@github.com:owner/repo.git and https://github.com/owner/repo(.git)
  const m = remote.match(/github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?\/?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

/**
 * Build-time git metadata for the footer's build signature. Every field
 * degrades to null when git is unavailable (e.g. building from a tarball),
 * so the footer can hide the commit line rather than break the build.
 */
export function getGitInfo(): GitInfo {
  const hash = git("rev-parse --short HEAD");
  const repoUrl = githubRepoUrl();
  return {
    hash,
    date: git("log -1 --format=%cs"),
    branch: git("rev-parse --abbrev-ref HEAD"),
    url: hash && repoUrl ? `${repoUrl}/commit/${hash}` : null,
    repoUrl,
  };
}
