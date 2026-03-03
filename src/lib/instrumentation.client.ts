import { WebTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-web";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

let initialized = false;

export function initClientTracing() {
  if (initialized) return;
  initialized = true;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "marginalia-client",
    [ATTR_SERVICE_VERSION]: "0.0.1",
  });

  // Use same-origin proxy to avoid CORS and keep collector private
  const exporter = new OTLPTraceExporter({
    url: "/api/telemetry/traces",
  });

  const provider = new WebTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  provider.register({
    contextManager: new ZoneContextManager(),
    propagator: new W3CTraceContextPropagator(),
  });

  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [/.*/],
        clearTimingResources: true,
        // Avoid infinite loops by ignoring telemetry requests
        ignoreUrls: [/\/api\/telemetry\//],
      }),
      new DocumentLoadInstrumentation(),
    ],
  });
}
