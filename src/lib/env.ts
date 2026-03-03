import { env as publicEnv } from "$env/dynamic/public";
import * as v from "valibot";

const envSchema = v.object({
  PUBLIC_SERVER: v.pipe(v.string(), v.minLength(1, "PUBLIC_SERVER is required")),
});

const parsed = v.safeParse(envSchema, {
  PUBLIC_SERVER: publicEnv.PUBLIC_SERVER,
});

if (!parsed.success) {
  console.error("Invalid public environment variables:");
  console.error(JSON.stringify(v.flatten(parsed.issues), null, 2));
  throw new Error("Public environment validation failed. Check the errors above.");
}

export const env = parsed.output;
