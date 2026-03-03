import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import { building } from "$app/environment";
import { env } from "$lib/server/env";
import { db } from "./db";
import * as schema from "./db/schema";
import { notif } from "./notifications";
import { projectInviteEmail } from "./emails/project-invite";
import { sendEmail } from "./emails/send";

// Pending project invites — keyed by email, used to pass context to sendMagicLink
export interface PendingInvite {
  projectId: string;
  projectName: string;
  inviterName: string;
  locale?: string;
}
export const pendingInvites = new Map<string, PendingInvite>();

let _auth: Auth | undefined;

function createAuth() {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    socialProviders: {
      ...(env.GITHUB_CLIENT_ID &&
        env.GITHUB_CLIENT_SECRET && {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
            scope: ["user:email", "repo"],
          },
        }),
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const locale = getRequestEvent().cookies.get("locale");
          const pendingInvite = pendingInvites.get(email);

          if (pendingInvite) {
            // Project invite — send invite email with embedded magic link
            pendingInvites.delete(email);
            const emailContent = projectInviteEmail({
              url,
              projectName: pendingInvite.projectName,
              inviterName: pendingInvite.inviterName,
              locale: pendingInvite.locale ?? locale,
            });
            await sendEmail(email, emailContent);
          } else {
            // Regular sign-in magic link
            await notif.send({
              type: "magic-link",
              recipientEmail: email,
              data: { url, locale },
            });
          }
        },
      }),
      sveltekitCookies(getRequestEvent),
    ],
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["github"],
        allowDifferentEmails: true,
      },
    },
    // Cookie domain for cross-subdomain auth (e.g., ".marginalia.miksu.app")
    ...(env.COOKIE_DOMAIN && {
      advanced: {
        cookies: {
          sessionToken: {
            attributes: {
              domain: env.COOKIE_DOMAIN,
            },
          },
        },
      },
    }),
  });
}

type Auth = ReturnType<typeof createAuth>;

export const auth: Auth = new Proxy({} as Auth, {
  get(_, prop) {
    if (building) {
      throw new Error("Cannot access auth during build");
    }
    if (!_auth) {
      _auth = createAuth();
    }
    return (_auth as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export type Session = Auth["$Infer"]["Session"]["session"];
export type User = Auth["$Infer"]["Session"]["user"];
