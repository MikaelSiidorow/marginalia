import { defineNotification } from "@mikstack/notifications";
import { magicLinkEmail } from "../emails/magic-link";

export const notifications = {
  "magic-link": defineNotification({
    key: "magic-link",
    critical: true, // Auth emails bypass user preferences
    channels: {
      email: (data: { url: string; locale?: string }) => magicLinkEmail(data.url, data.locale),
    },
  }),
  // Note: Email invites are sent via magic link flow (auth.ts + project-invite.ts email)
  // This notification is only for in-app display to existing logged-in users
  "project-invite": defineNotification({
    key: "project-invite",
    channels: {
      "in-app": (data: { projectName: string; inviterName: string; projectId: string }) => ({
        title: `Invited to ${data.projectName}`,
        body: `${data.inviterName} invited you to review this project`,
        url: `/projects/${data.projectId}`,
      }),
    },
  }),
} as const;
