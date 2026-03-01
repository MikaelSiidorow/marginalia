import type { RequestHandler } from "./$types";
import { eq, and } from "drizzle-orm";
import { db } from "$lib/server/db";
import * as schema from "$lib/server/db/schema";
import { getGitHubToken, githubApi, type GitHubTree } from "$lib/server/github";

export const GET: RequestHandler = async ({ locals, url, request }) => {
  if (!locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ error: "projectId required" }, { status: 400 });
  }

  // Verify membership
  const member = await db
    .select()
    .from(schema.projectMember)
    .where(
      and(
        eq(schema.projectMember.projectId, projectId),
        eq(schema.projectMember.userId, locals.user.id),
      ),
    )
    .limit(1);

  if (!member.length) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get project details
  const [project] = await db
    .select()
    .from(schema.project)
    .where(eq(schema.project.id, projectId))
    .limit(1);

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Get GitHub token from project owner
  const token = await getGitHubToken(project.ownerId);
  if (!token) {
    return Response.json({ error: "GitHub not connected for project owner" }, { status: 403 });
  }

  const ref = url.searchParams.get("ref") || project.defaultBranch;
  const tree = await githubApi<GitHubTree>(
    token,
    `/repos/${project.repoFullName}/git/trees/${ref}?recursive=1`,
  );

  const etag = `"${tree.sha}"`;
  if (request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304 });
  }

  return Response.json(tree, {
    headers: {
      ETag: etag,
      "Cache-Control": "private, max-age=60",
    },
  });
};
