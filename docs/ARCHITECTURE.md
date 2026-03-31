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

### Reliable rendering

Diagrams must render correctly and consistently — whether viewed in the editor, opened via a shared URL, or embedded as an image in a README. Server-side rendering via Puppeteer guarantees consistent output regardless of the user's browser, OS, or installed fonts. Encoding diagrams directly into the URL (base64, no database) means anyone with the link sees the diagram, and the embeddable `/chart/{code}.png` pattern works in contexts that can't run JavaScript.

### Cost efficiency

The rendering infrastructure is a serverless function fronted by a CDN with 24-hour edge caching. Because diagram code is part of the URL, each unique diagram gets its own cache entry. Repeated renders of the same diagram never hit the function, they're served from the edge.

### Continuous validation

A Playwright-based synthetic test suite runs continuously via GitHub Actions. It simulates real user flows (editing, sharing, error recovery, embed fetches) against production, providing a continuous signal on availability that doesn't depend on real user traffic.

## KPIs

Each design goal maps to measurable indicators. The same concern (e.g. latency) is measured at multiple layers — RUM captures the user's experience, traces capture the server's perspective, and synthetic monitoring provides a continuous baseline.

| Design Goal             | KPI                                          | Source    | Target   |
| ----------------------- | -------------------------------------------- | --------- | -------- |
| Instant feedback        | User action duration — edit to preview (p95) | RUM       | < 4s     |
| Instant feedback        | Visually complete time (p95)                 | RUM       | < 2s     |
| Instant feedback        | API response time (p95)                      | Traces    | < 3s     |
| Reliable rendering      | Embed render success rate                    | Traces    | > 99%    |
| Reliable rendering      | JS error-free session rate                   | RUM       | > 95%    |
| Cost efficiency         | CDN cache hit rate                           | Inferred  | > 60%    |
| Cost efficiency         | Function execution time (p95)                | Traces    | < 3s     |
| Continuous validation   | Synthetic availability                       | Synthetic | > 99.5%  |

## Observability

Three layers of instrumentation feed into Dynatrace, each covering different KPIs.

### Frontend — Real User Monitoring

A RUM agent is injected in `index.html` and runs in every user's browser. It captures:

- **Visually complete time:** how long until the editor and preview are both rendered and usable
- **User action duration:** the time from when a user finishes typing to when the preview image loads — the real "instant feedback" metric from the user's perspective, including network, debounce delay, and image decode
- **JS error-free session rate:** percentage of sessions without JavaScript errors — more meaningful than raw error count because one broken session with many errors shouldn't look like many separate problems
- **Session context:** browser, OS, geography, session duration

RUM is the source of truth for user experience. If preview latency degrades or rendering breaks, RUM surfaces it with full session context — including geographic distribution, so a regression affecting only certain regions doesn't hide behind a global p95.

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

This covers the **API response time**, **function execution time**, and **embed render success rate** KPIs. The span breakdown reveals where time is spent — browser cold starts show up as outliers in `screenshot.launch_browser`, while actual rendering time is isolated in `screenshot.capture`. Exception recording captures the full error context when renders fail.

The tracing setup degrades gracefully: if the OTLP endpoint or API token is missing, tracing silently disables and the function operates normally.

### Synthetic monitoring

A Playwright test suite (`synthetic/simulate.ts`) runs on a 15-minute cron via GitHub Actions. It exercises four scenarios against production:

1. **Editor flow:** loads the app, types multiple diagrams, switches between them. Validates rendering and tests cache hit/miss patterns (first render = miss, revisit = hit).
2. **Syntax error recovery:** types invalid Mermaid, confirms the error state, then fixes the syntax and verifies recovery.
3. **Share workflow:** creates a diagram and uses the copy/share feature.
4. **Embed simulation:** makes direct HTTP fetches (no browser) for chart PNGs to test the CDN cache layer and measure raw API response times.

The synthetic tests identify as `SpriteBot/synthetic` in the user agent and generate both RUM sessions and API traces, so their results are visible across all three observability layers.

This covers the **synthetic availability** and **CDN cache hit rate** KPIs. Availability is the percentage of 5-minute intervals with a passing test — effectively the uptime number. Cache hit rate is inferred from the embed simulation scenario, which fetches the same diagrams repeatedly and measures whether responses come from the edge or the function.

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
