// OpenTelemetry instrumentation - only enabled when OTEL_EXPORTER_OTLP_ENDPOINT is configured
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (otlpEndpoint) {
  // Dynamic imports to avoid loading OTEL when not configured
  void Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/auto-instrumentations-node"),
    import("@opentelemetry/exporter-trace-otlp-proto"),
    import("@opentelemetry/exporter-logs-otlp-proto"),
    import("@opentelemetry/resources"),
    import("@opentelemetry/semantic-conventions"),
    import("@opentelemetry/sdk-logs"),
    import("@opentelemetry/core"),
  ]).then(
    ([
      { NodeSDK },
      { getNodeAutoInstrumentations },
      { OTLPTraceExporter },
      { OTLPLogExporter },
      { resourceFromAttributes },
      { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION },
      { SimpleLogRecordProcessor },
      { W3CTraceContextPropagator },
    ]) => {
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
      console.log(`OpenTelemetry initialized, exporting to ${otlpEndpoint}`);

      process.on("SIGTERM", () => {
        void sdk.shutdown().finally(() => process.exit(0));
      });
    },
  );
}
