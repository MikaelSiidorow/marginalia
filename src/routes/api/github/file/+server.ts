import type { RequestHandler } from "./$types";
import { eq, and } from "drizzle-orm";
import { db } from "$lib/server/db";
import * as schema from "$lib/server/db/schema";
import { getGitHubToken, githubApi } from "$lib/server/github";

interface GitHubBlob {
  content: string;
  encoding: string;
  sha: string;
  size: number;
}

export const GET: RequestHandler = async ({ locals, url, request }) => {
  if (!locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = url.searchParams.get("projectId");
  const path = url.searchParams.get("path");
  const blobSha = url.searchParams.get("sha");
  if (!projectId || !path) {
    return Response.json({ error: "projectId and path required" }, { status: 400 });
  }

  // If the client sent the blob SHA, use it for conditional requests
  if (blobSha) {
    const etag = `"${blobSha}"`;
    if (request.headers.get("If-None-Match") === etag) {
      return new Response(null, { status: 304 });
    }
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

  const [project] = await db
    .select()
    .from(schema.project)
    .where(eq(schema.project.id, projectId))
    .limit(1);

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const token = await getGitHubToken(project.ownerId);
  if (!token) {
    return Response.json({ error: "GitHub not connected for project owner" }, { status: 403 });
  }

  let bytes: Uint8Array;
  let sha: string;

  if (blobSha) {
    // Fetch by blob SHA (content-addressed, immutable)
    const blob = await githubApi<GitHubBlob>(
      token,
      `/repos/${project.repoFullName}/git/blobs/${blobSha}`,
    );
    bytes = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
    sha = blob.sha;
  } else {
    // Fallback: fetch by path and ref
    const ref = url.searchParams.get("ref") || project.defaultBranch;
    const blob = await githubApi<GitHubBlob>(
      token,
      `/repos/${project.repoFullName}/contents/${encodeURIComponent(path)}?ref=${ref}`,
    );
    bytes = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
    sha = blob.sha;
  }

  const etag = `"${sha}"`;
  const binary = url.searchParams.get("binary") === "1";

  if (binary) {
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        ETag: etag,
        "Cache-Control": blobSha
          ? "private, max-age=31536000, immutable"
          : "private, max-age=300",
      },
    });
  }

  // Pass raw bytes directly — the client's res.text() will decode using the charset header.
  // Avoids a server-side TextDecoder round-trip that can corrupt non-ASCII under some runtimes.
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ETag: etag,
      "Cache-Control": blobSha
        ? "private, max-age=31536000, immutable"
        : "private, max-age=300",
    },
  });
};
