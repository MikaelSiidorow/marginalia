import { env as privateEnv } from "$env/dynamic/private";
import * as v from "valibot";

const envSchema = v.object({
  DATABASE_URL: v.pipe(v.string(), v.minLength(1, "DATABASE_URL is required")),
  BETTER_AUTH_SECRET: v.pipe(v.string(), v.minLength(1, "BETTER_AUTH_SECRET is required")),
  BETTER_AUTH_URL: v.optional(v.string(), "http://localhost:5173"),
  COOKIE_DOMAIN: v.optional(v.string()), // e.g., ".marginalia.miksu.app"
  OTEL_EXPORTER_OTLP_ENDPOINT: v.optional(v.string()), // e.g., "http://otel-collector:4318"
  LOG_LEVEL: v.optional(v.string()),
  SMTP_HOST: v.optional(v.string()),
  SMTP_PORT: v.optional(v.string()),
  SMTP_USER: v.optional(v.string()),
  SMTP_PASS: v.optional(v.string()),
  SMTP_FROM: v.optional(v.string()),
  GITHUB_CLIENT_ID: v.optional(v.string()),
  GITHUB_CLIENT_SECRET: v.optional(v.string()),
});

const parsed = v.safeParse(envSchema, {
  DATABASE_URL: privateEnv.DATABASE_URL,
  BETTER_AUTH_SECRET: privateEnv.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: privateEnv.BETTER_AUTH_URL || undefined,
  COOKIE_DOMAIN: privateEnv.COOKIE_DOMAIN || undefined,
  OTEL_EXPORTER_OTLP_ENDPOINT: privateEnv.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
  LOG_LEVEL: privateEnv.LOG_LEVEL || undefined,
  SMTP_HOST: privateEnv.SMTP_HOST || undefined,
  SMTP_PORT: privateEnv.SMTP_PORT || undefined,
  SMTP_USER: privateEnv.SMTP_USER || undefined,
  SMTP_PASS: privateEnv.SMTP_PASS || undefined,
  SMTP_FROM: privateEnv.SMTP_FROM || undefined,
  GITHUB_CLIENT_ID: privateEnv.GITHUB_CLIENT_ID || undefined,
  GITHUB_CLIENT_SECRET: privateEnv.GITHUB_CLIENT_SECRET || undefined,
});

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(JSON.stringify(v.flatten(parsed.issues), null, 2));
  throw new Error("Environment validation failed. Check the errors above.");
}

export const env = parsed.output;
