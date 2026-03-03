import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "$lib/server/env";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleDB | undefined;

export const db = new Proxy({} as DrizzleDB, {
  get(_, prop) {
    if (!_db) {
      const client = postgres(env.DATABASE_URL);
      _db = drizzle(client, { schema, casing: "snake_case" });
      instrumentDrizzleClient(_db, {
        dbSystem: "postgresql",
        dbName: "marginalia",
      });
    }
    return _db[prop as keyof typeof _db];
  },
});
