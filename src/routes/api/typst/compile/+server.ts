import type { RequestHandler } from "./$types";
import { eq, and } from "drizzle-orm";
import { db } from "$lib/server/db";
import * as schema from "$lib/server/db/schema";
import { compileProject } from "$lib/server/typst/compiler";

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const projectId = body.projectId;
  if (!projectId || typeof projectId !== "string") {
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

  try {
    const result = await compileProject(projectId);
    return Response.json({
      pages: result.pages,
      pageSvgs: result.pageSvgs,
      diagnostics: result.diagnostics,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Compilation failed";
    return Response.json({ error: message }, { status: 500 });
  }
};
