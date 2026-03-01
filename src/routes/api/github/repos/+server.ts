import type { RequestHandler } from "./$types";
import { getGitHubToken, githubApi, type GitHubRepo } from "$lib/server/github";

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await getGitHubToken(locals.user.id);
  if (!token) {
    return Response.json({ error: "GitHub not connected" }, { status: 403 });
  }

  const repos = await githubApi<GitHubRepo[]>(
    token,
    "/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member",
  );

  return Response.json(
    repos.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      name: r.name,
      owner: r.owner.login,
      ownerAvatar: r.owner.avatar_url,
      defaultBranch: r.default_branch,
      private: r.private,
      description: r.description,
    })),
  );
};
