import { eq, and } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./db/schema";

/**
 * Get the GitHub access token for a user from their linked account.
 */
export async function getGitHubToken(userId: string): Promise<string | null> {
  const acc = await db
    .select({ accessToken: schema.account.accessToken })
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "github")))
    .limit(1);
  return acc[0]?.accessToken ?? null;
}

/**
 * Make an authenticated request to the GitHub API.
 */
export async function githubApi<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export type GitHubRepo = {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  default_branch: string;
  private: boolean;
  description: string | null;
};

export type GitHubTreeEntry = {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
};

export type GitHubTree = {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
};

export type GitHubContent = {
  content: string;
  encoding: string;
  sha: string;
  size: number;
};
