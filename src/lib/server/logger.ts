import pino from "pino";
import { trace } from "@opentelemetry/api";
import { dev } from "$app/environment";
import { env as privateEnv } from "$env/dynamic/private";

function traceMixin() {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const spanContext = span.spanContext();
  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: spanContext.traceFlags,
  };
}

export const logger = pino({
  level: privateEnv.LOG_LEVEL || (dev ? "debug" : "info"),
  mixin: traceMixin,
  transport: dev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
        },
      }
    : undefined,
});
