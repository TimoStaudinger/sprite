import {NodeSDK} from '@opentelemetry/sdk-node'
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http'
import {resourceFromAttributes} from '@opentelemetry/resources'
import {ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION} from '@opentelemetry/semantic-conventions'
import {trace, Span, SpanStatusCode} from '@opentelemetry/api'
import {SimpleSpanProcessor} from '@opentelemetry/sdk-trace-node'

const TRACER_NAME = 'sprite-api'

const endpoint = process.env.DT_OTLP_ENDPOINT
const apiToken = process.env.DT_API_TOKEN

let initialized = false
let spanProcessor: SimpleSpanProcessor | null = null

function initTracing() {
  console.log('[tracing] initTracing called', {
    hasEndpoint: !!endpoint,
    hasApiToken: !!apiToken,
    initialized,
  })

  if (initialized || !endpoint || !apiToken) return
  initialized = true

  const exportUrl = `${endpoint}/v1/traces`
  console.log('[tracing] Configuring OTLP exporter', {url: exportUrl})

  const exporter = new OTLPTraceExporter({
    url: exportUrl,
    headers: {
      Authorization: `Api-Token ${apiToken}`,
    },
  })

  spanProcessor = new SimpleSpanProcessor(exporter)

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'sprite-api',
      [ATTR_SERVICE_VERSION]: '1.0.0',
    }),
    spanProcessors: [spanProcessor],
  })

  sdk.start()
  console.log('[tracing] SDK started successfully')
}

initTracing()

export function getTracer() {
  return trace.getTracer(TRACER_NAME)
}

export async function flushTraces() {
  if (spanProcessor) {
    await spanProcessor.forceFlush()
  }
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = getTracer()
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span)
      span.setStatus({code: SpanStatusCode.OK})
      return result
    } catch (error) {
      span.setStatus({code: SpanStatusCode.ERROR, message: String(error)})
      span.recordException(error as Error)
      throw error
    } finally {
      span.end()
    }
  })
}
