import type { RequestHandler } from "./$types";
import { eq, and } from "drizzle-orm";
import { db } from "$lib/server/db";
import * as schema from "$lib/server/db/schema";
import { jumpToPreview, jumpToSource } from "$lib/server/typst/tinymist";

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    projectId?: string;
    direction?: string;
    file?: string;
    line?: number;
    col?: number;
    page?: number;
    x?: number;
    y?: number;
  };
  const { projectId, direction, file, line, page, x, y } = body;

  if (!projectId || typeof projectId !== "string") {
    return Response.json({ error: "projectId required" }, { status: 400 });
  }

  if (direction !== "toPreview" && direction !== "toSource") {
    return Response.json({ error: "direction must be 'toPreview' or 'toSource'" }, { status: 400 });
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
    if (direction === "toPreview") {
      if (!file || typeof line !== "number") {
        return Response.json({ error: "file and line required" }, { status: 400 });
      }
      const result = await jumpToPreview(projectId, file, line - 1);
      if (!result) {
        return Response.json({ error: "Jump resolution failed" }, { status: 404 });
      }
      return Response.json(result);
    } else {
      if (typeof page !== "number" || typeof x !== "number" || typeof y !== "number") {
        return Response.json({ error: "page, x, and y required" }, { status: 400 });
      }
      const result = await jumpToSource(projectId, page, x, y);
      if (!result) {
        return Response.json({ error: "Jump resolution failed" }, { status: 404 });
      }
      return Response.json(result);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Jump failed";
    return Response.json({ error: message }, { status: 500 });
  }
};
