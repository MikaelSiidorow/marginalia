import type { RequestHandler } from "./$types";
import { eq, and } from "drizzle-orm";
import { db } from "$lib/server/db";
import * as schema from "$lib/server/db/schema";
import { auth, pendingInvites } from "$lib/server/auth";
import { notif } from "$lib/server/notifications";

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const headers = request.headers;
  if (!locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { projectId?: string; email?: string };
  const { projectId, email } = body;
  if (!projectId || !email) {
    return Response.json({ error: "projectId and email required" }, { status: 400 });
  }

  // Verify requester is a member (preferably owner)
  const [requesterMember] = await db
    .select()
    .from(schema.projectMember)
    .where(
      and(
        eq(schema.projectMember.projectId, projectId),
        eq(schema.projectMember.userId, locals.user.id),
      ),
    )
    .limit(1);

  if (!requesterMember) {
    return Response.json({ error: "Not a member of this project" }, { status: 403 });
  }

  // Find or check user by email
  const [targetUser] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);

  if (targetUser) {
    // Check if already a member
    const [existing] = await db
      .select()
      .from(schema.projectMember)
      .where(
        and(
          eq(schema.projectMember.projectId, projectId),
          eq(schema.projectMember.userId, targetUser.id),
        ),
      )
      .limit(1);

    if (existing) {
      return Response.json({ error: "User is already a member" }, { status: 400 });
    }

    // Add as reviewer
    await db.insert(schema.projectMember).values({
      id: crypto.randomUUID(),
      projectId,
      userId: targetUser.id,
      role: "reviewer",
      invitedAt: new Date(),
    });
  }

  // Get project info for the notification
  const [project] = await db
    .select()
    .from(schema.project)
    .where(eq(schema.project.id, projectId))
    .limit(1);

  // Set pending invite context for sendMagicLink to pick up
  pendingInvites.set(email, {
    projectId,
    projectName: project?.repoFullName ?? "Unknown",
    inviterName: locals.user.name ?? "Someone",
    locale: cookies.get("locale"),
  });

  // Trigger magic link sign-in — this sends the invite email with embedded auth link
  // The user clicks the link → signs in → lands on the project → email is verified
  try {
    await auth.api.signInMagicLink({
      body: {
        email,
        callbackURL: `/projects/${projectId}`,
      },
      headers,
    });
  } catch {
    // Clean up on failure
    pendingInvites.delete(email);
    return Response.json({ error: "Failed to send invitation" }, { status: 500 });
  }

  // Also send in-app notification for existing users (they'll see it when logged in)
  if (targetUser) {
    try {
      await notif.send({
        type: "project-invite",
        userId: targetUser.id,
        data: {
          projectName: project?.repoFullName ?? "Unknown",
          inviterName: locals.user.name ?? "Someone",
          projectId,
        },
      });
    } catch {
      // In-app notification is best-effort
    }
  }

  return Response.json({ ok: true });
};
