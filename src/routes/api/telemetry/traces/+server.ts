import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import { env } from "$lib/server/env";
import { logger } from "$lib/server/logger";

export const POST: RequestHandler = async ({ request }) => {
  const otelEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;

  // Silently accept but don't forward if OTEL is not configured
  if (!otelEndpoint) {
    return new Response(null, { status: 202 });
  }

  try {
    const body = await request.arrayBuffer();

    const response = await fetch(`${otelEndpoint}/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("Content-Type") || "application/json",
      },
      body,
    });

    if (!response.ok) {
      logger.error({ status: response.status }, "Failed to forward traces to OTEL collector");
      return json({ error: "Failed to forward traces" }, { status: 502 });
    }

    return new Response(null, { status: 202 });
  } catch (err) {
    logger.error({ err }, "Error forwarding traces to OTEL collector");
    return json({ error: "Internal error" }, { status: 500 });
  }
};
