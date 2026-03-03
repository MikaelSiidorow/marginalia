import { createAddHookMessageChannel } from "import-in-the-middle";
import { register } from "node:module";

const { registerOptions } = createAddHookMessageChannel();
register("import-in-the-middle/hook.mjs", import.meta.url, registerOptions);

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

// Only initialize OTEL if endpoint is configured
if (otlpEndpoint) {
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-proto");
  const { OTLPLogExporter } = await import("@opentelemetry/exporter-logs-otlp-proto");
  const { SimpleLogRecordProcessor } = await import("@opentelemetry/sdk-logs");
  const { resourceFromAttributes } = await import("@opentelemetry/resources");
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } =
    await import("@opentelemetry/semantic-conventions");
  const { W3CTraceContextPropagator } = await import("@opentelemetry/core");

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "marginalia-server",
    [ATTR_SERVICE_VERSION]: "0.0.1",
  });

  const logExporter = new OTLPLogExporter({
    url: `${otlpEndpoint}/v1/logs`,
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    }),
    textMapPropagator: new W3CTraceContextPropagator(),
    logRecordProcessors: [new SimpleLogRecordProcessor(logExporter)],
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-pino": { enabled: true },
        "@opentelemetry/instrumentation-http": { enabled: true },
      }),
    ],
  });

  sdk.start();
  console.log(`[OpenTelemetry] Initialized, exporting to ${otlpEndpoint}`);

  process.on("SIGTERM", () => {
    void sdk.shutdown().finally(() => process.exit(0));
  });
}
