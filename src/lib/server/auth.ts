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
          await notif.send({
            type: "magic-link",
            recipientEmail: email,
            data: { url, locale: getRequestEvent().cookies.get("locale") },
          });
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
