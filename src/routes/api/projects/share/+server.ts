import type { RequestHandler } from "./$types";
import { eq, and } from "drizzle-orm";
import { db } from "$lib/server/db";
import * as schema from "$lib/server/db/schema";
import { notif } from "$lib/server/notifications";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, email } = await request.json();
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
  let [targetUser] = await db
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

  // Send invitation email via magic link (the email will serve as the invite)
  // The user will get a magic link to sign in, which drops them at the project page
  try {
    await notif.send({
      type: "project-invite",
      recipientEmail: email,
      ...(targetUser ? { userId: targetUser.id } : {}),
      data: {
        projectName: project?.repoFullName ?? "Unknown",
        inviterName: locals.user.name,
        projectId,
      },
    });
  } catch {
    // Notification sending is best-effort
  }

  return Response.json({ ok: true });
};
