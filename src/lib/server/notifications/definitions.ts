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
  "project-invite": defineNotification({
    key: "project-invite",
    channels: {
      email: (data: { projectName: string; inviterName: string; projectId: string }) => ({
        subject: `You've been invited to review ${data.projectName}`,
        text: `${data.inviterName} invited you to review "${data.projectName}" on marginalia. Sign in to get started.`,
        html: `<p><strong>${data.inviterName}</strong> invited you to review <strong>${data.projectName}</strong> on marginalia.</p><p>Sign in to get started.</p>`,
      }),
      "in-app": (data: { projectName: string; inviterName: string; projectId: string }) => ({
        title: `Invited to ${data.projectName}`,
        body: `${data.inviterName} invited you to review this project`,
        url: `/projects/${data.projectId}`,
      }),
    },
  }),
} as const;
