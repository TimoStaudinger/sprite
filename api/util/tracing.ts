import {NodeSDK} from '@opentelemetry/sdk-node'
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http'
import {Resource} from '@opentelemetry/resources'
import {ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION} from '@opentelemetry/semantic-conventions'
import {trace, Span, SpanStatusCode} from '@opentelemetry/api'

const TRACER_NAME = 'sprite-api'

const endpoint = process.env.DT_OTLP_ENDPOINT
const apiToken = process.env.DT_API_TOKEN

let initialized = false

function initTracing() {
  if (initialized || !endpoint || !apiToken) return
  initialized = true

  const exporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
    headers: {
      Authorization: `Api-Token ${apiToken}`,
    },
  })

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'sprite-api',
      [ATTR_SERVICE_VERSION]: '1.0.0',
    }),
    traceExporter: exporter,
  })

  sdk.start()
}

initTracing()

export function getTracer() {
  return trace.getTracer(TRACER_NAME)
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
