import { drizzleZeroConfig } from "drizzle-zero";
import * as schema from "./src/lib/server/db/schema";

export default drizzleZeroConfig(schema, {
  tables: {
    user: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      createdAt: true,
      updatedAt: true,
    },
    project: true,
    projectMember: true,
    repoVersion: true,
    comment: true,
    inAppNotification: true,
    // Exclude auth-internal and server-only tables from client sync
    session: false,
    account: false,
    verification: false,
    notificationDelivery: false,
    notificationPreference: false,
  },
  casing: "snake_case",
});
