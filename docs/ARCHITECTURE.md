# Sprite — Architecture & Observability

Sprite is a web-based Mermaid diagram editor with live preview and image export. Users write Mermaid syntax in a web editor and see a rendered PNG preview in real time. Diagrams are shareable via encoded URLs -- the application is fully stateless with no database or user accounts.

**Live at [sprite.link](https://sprite.link).**

## System overview

| Layer          | Technology                                     |
| -------------- |------------------------------------------------|
| Frontend       | React, TypeScript, Vite                        |
| Editor         | Monaco Editor with custom Mermaid language     |
| Diagrams       | Mermaid.js                                     |
| Backend        | Vercel Serverless Functions (Node.js)          |
| Screenshot     | Puppeteer + chrome-aws-lambda                  |
| Observability  | OpenTelemetry (OTLP) + Dynatrace RUM           |
| Hosting        | Vercel                                         |
| Monitoring     | Playwright synthetic tests (GitHub Actions)    |

## Design goals

### Instant feedback

The editor must feel responsive — when a user types, the preview should update within seconds. This drives the debounced rendering approach (300ms delay before API call) and aggressive CDN caching so repeat renders are near-instant.

### Zero-friction sharing

Diagrams are encoded directly into the URL via base64. No accounts, no database, no sign-up. Anyone with the link sees the diagram. This also enables an embeddable image URL pattern (`/chart/{code}.png`) that works in READMEs, docs, and messengers.

### Reliable rendering

Mermaid diagrams are rendered server-side using a headless browser (Puppeteer), not on the client. This guarantees consistent output regardless of the user's browser, OS, or installed fonts. It also means the image URL works in contexts that can't run JavaScript.

### Cost efficiency

The rendering infrastructure is a serverless function fronted by a CDN with 24-hour edge caching. Because diagram code is part of the URL, each unique diagram gets its own cache entry. Repeated renders of the same diagram never hit the function, they're served from the edge.

### Production confidence

A Playwright-based synthetic test suite runs continuously via GitHub Actions. It simulates real user flows (editing, sharing, error recovery, embed fetches) against production, generating continuous availability and performance data.

## KPIs

Each design goal maps to measurable indicators:

| Design Goal          | KPI                            | Target       |
| -------------------- | ------------------------------ | ------------ |
| Instant feedback     | Preview render latency (p95)   | < 3s         |
| Instant feedback     | API response time (p50 / p95)  | < 1s / < 3s  |
| Zero-friction sharing| Share action success rate       | ~100%        |
| Reliable rendering   | Chart render error rate         | < 1%         |
| Reliable rendering   | Availability (synthetic)        | > 99.5%      |
| Cost efficiency      | CDN cache hit rate              | > 60%        |
| Cost efficiency      | Cold start frequency            | Minimize     |
| Production confidence| Synthetic test pass rate        | 100%         |

## Observability

Three layers of instrumentation feed into Dynatrace, each covering different KPIs.

### Frontend — Real User Monitoring

A RUM agent is injected in `index.html` and runs in every user's browser. It captures:

- **Page load timing:** how long until the editor is interactive
- **User action timing:** how long from keystroke to rendered preview
- **JavaScript errors:** uncaught exceptions, failed API calls
- **Session context:** browser, OS, geography, session duration

This covers the **instant feedback** and **sharing** KPIs from the user's perspective. If preview latency degrades or the share button breaks, RUM surfaces it immediately with full session context.

### Backend — Distributed tracing

The serverless function at `/api/chart` is instrumented with OpenTelemetry, exporting traces via OTLP to Dynatrace.

**Span hierarchy:**

```
chart.generate
├── screenshot
│   ├── screenshot.launch_browser
│   ├── screenshot.capture
│   └── screenshot.close_browser
```

**Custom attributes on each trace:**

| Attribute              | Span               | Purpose                         |
| ---------------------- |--------------------|---------------------------------|
| `http.route`           | chart.generate     | Route identification            |
| `chart.code_length`    | chart.generate     | Input size (complexity proxy)   |
| `chart.image_bytes`    | chart.generate     | Output size                     |
| `screenshot.width`     | screenshot.capture | Rendered diagram dimensions     |
| `screenshot.height`    | screenshot.capture | Rendered diagram dimensions     |

This covers the **API response time** and **error rate** KPIs. The span breakdown reveals where time is spent — browser cold starts vs. actual rendering — and exception recording captures the full error context when renders fail.

The tracing setup degrades gracefully: if the OTLP endpoint or API token is missing, tracing silently disables and the function operates normally.

### Synthetic monitoring

A Playwright test suite (`synthetic/simulate.ts`) runs on a 15-minute cron via GitHub Actions. It exercises four scenarios against production:

1. **Editor flow:** loads the app, types multiple diagrams, switches between them. Validates rendering and tests cache hit/miss patterns (first render = miss, revisit = hit).
2. **Syntax error recovery:** types invalid Mermaid, confirms the error state, then fixes the syntax and verifies recovery.
3. **Share workflow:** creates a diagram and uses the copy/share feature.
4. **Embed simulation:** makes direct HTTP fetches (no browser) for chart PNGs to test the CDN cache layer and measure raw API response times.

The synthetic tests identify as `SpriteBot/synthetic` in the user agent and generate both RUM sessions and API traces, so their results are visible across all three observability layers.

This covers the **availability** and **cache hit rate** KPIs with continuous, automated signal.

## End-to-end trace flow

A single user interaction touches all three observability layers:

```
1. User types in editor
   └─ RUM captures user action start

2. Debounced API call (300ms)
   └─ GET /api/chart/{base64}.png

3. Vercel CDN
   ├─ Cache HIT  → return PNG from edge (fast path)
   └─ Cache MISS → forward to serverless function

4. Serverless function (traced via OpenTelemetry)
   ├─ chart.generate span starts
   ├─ Decode Mermaid code, build HTML
   ├─ screenshot span → launch browser, capture PNG
   └─ Return PNG with cache headers (60s browser, 24h CDN)

5. Response arrives in browser
   └─ RUM captures user action end (total round-trip time)

6. Synthetic tests validate this path every 5 minutes
   └─ Generates continuous baseline for all metrics
```

RUM provides the user's perspective (total latency including network). Backend tracing provides the server's perspective (where time is spent inside the function). Synthetic monitoring provides continuous validation that the entire path works.

## Next steps

- **SLOs** on availability (> 99.5%) and API response time (p95 < 3s) to formalize targets and track burn rate
- **Alerting** on error rate spikes and availability drops detected by synthetic tests
- **Business events** for diagram creation and sharing to measure product engagement alongside technical health
- **Release comparison** to correlate deployments with performance changes — did the latest deploy affect render latency?
