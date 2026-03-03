import type { RequestHandler } from "./$types";
import { eq, and } from "drizzle-orm";
import { db } from "$lib/server/db";
import * as schema from "$lib/server/db/schema";
import { getCachedResult } from "$lib/server/typst/compiler";

export const GET: RequestHandler = async ({ locals, url, params }) => {
  if (!locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ error: "projectId required" }, { status: 400 });
  }

  const pageIndex = parseInt(params.page, 10);
  if (isNaN(pageIndex) || pageIndex < 0) {
    return Response.json({ error: "Invalid page number" }, { status: 400 });
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

  const result = getCachedResult(projectId);
  if (!result) {
    return Response.json({ error: "Not compiled yet" }, { status: 404 });
  }

  if (pageIndex >= result.pageSvgs.length) {
    return Response.json({ error: "Page out of range" }, { status: 404 });
  }

  return new Response(result.pageSvgs[pageIndex], {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, max-age=3600",
    },
  });
};
