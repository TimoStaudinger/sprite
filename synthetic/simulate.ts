import { chromium, type Page } from "playwright";

const BASE_URL = "https://sprite.link";
const HEADED = !!process.env.HEADED;

// --- Helpers ---

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(minMs = 1000, maxMs = 5000) {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}

function encode(code: string): string {
  const bytes = new TextEncoder().encode(code);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return encodeURIComponent(btoa(binary));
}

function uniqueId() {
  return `t${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// --- Diagrams ---

const defaultFlowchart = `graph TB
  start(Start)

  start ==> login[Login]

  login ==> auth{Authorized?}

  auth -- No  --> tooManyTries{Attempted 3 times?}
  auth == Yes ==> granted[Access granted]

  granted ==> exit{Exit module?}

  exit -- No  --> granted
  exit == Yes ==> finish(End)

  tooManyTries -- No  --> login
  tooManyTries -- Yes --> finish`;

function uniqueSequenceDiagram() {
  const id = uniqueId();
  return `sequenceDiagram
    participant User_${id}
    participant Server
    participant Database

    User_${id}->>Server: POST /login
    Server->>Database: SELECT user
    Database-->>Server: user record
    Server-->>User_${id}: 200 OK + token`;
}

function uniqueClassDiagram() {
  const id = uniqueId();
  return `classDiagram
    class Animal_${id} {
      +String name
      +int age
      +makeSound()
    }
    class Dog_${id} {
      +fetch()
    }
    class Cat_${id} {
      +purr()
    }
    Animal_${id} <|-- Dog_${id}
    Animal_${id} <|-- Cat_${id}`;
}

function uniqueStateDiagram() {
  const id = uniqueId();
  return `stateDiagram-v2
    [*] --> Idle_${id}
    Idle_${id} --> Processing_${id}: submit
    Processing_${id} --> Done_${id}: complete
    Processing_${id} --> Error_${id}: fail
    Error_${id} --> Idle_${id}: retry
    Done_${id} --> [*]`;
}

const invalidSyntax = `graph TB
  A[Start
  B --> C
  this is not valid mermaid {{{}}}`;

function fixedSyntax() {
  const id = uniqueId();
  return `graph TB
  A_${id}[Start] --> B_${id}[Process]
  B_${id} --> C_${id}[End]`;
}

// --- Monaco helpers ---

async function getChartSrc(page: Page): Promise<string> {
  return page.evaluate(() => {
    const img = document.querySelector(
      'img[alt="Chart preview"]'
    ) as HTMLImageElement | null;
    return img?.src ?? "";
  });
}

async function clearEditor(page: Page) {
  await page.click(".monaco-editor .view-lines");
  await sleep(200);
  const isMac = process.platform === "darwin";
  await page.keyboard.press(isMac ? "Meta+a" : "Control+a");
  await page.keyboard.press("Backspace");
  await sleep(300);
}

async function typeInEditor(page: Page, code: string) {
  await clearEditor(page);

  // Type line by line, using Enter for newlines
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      await page.keyboard.press("Enter");
    }
    await page.keyboard.type(lines[i], { delay: 15 });
    await sleep(30 + Math.random() * 50);
  }
}

async function setEditorValue(page: Page, code: string) {
  // Use clipboard paste for instant value setting (e.g. switching back to a prior diagram)
  await clearEditor(page);
  await page.evaluate((text: string) => {
    navigator.clipboard.writeText(text);
  }, code);
  const isMac = process.platform === "darwin";
  await page.keyboard.press(isMac ? "Meta+v" : "Control+v");
  await sleep(300);
}

async function waitForChartLoad(page: Page, timeoutMs = 30000) {
  await page.waitForFunction(
    () => {
      const img = document.querySelector(
        'img[alt="Chart preview"]'
      ) as HTMLImageElement | null;
      return img && img.complete && img.naturalWidth > 0;
    },
    { timeout: timeoutMs }
  );
}

async function waitForChartUpdate(
  page: Page,
  previousSrc: string,
  timeoutMs = 30000
) {
  // Wait for the chart image src to change AND the new image to load
  try {
    await page.waitForFunction(
      (prevSrc: string) => {
        const img = document.querySelector(
          'img[alt="Chart preview"]'
        ) as HTMLImageElement | null;
        if (!img) return false;
        return img.src !== prevSrc && img.complete && img.naturalWidth > 0;
      },
      previousSrc,
      { timeout: timeoutMs }
    );
  } catch {
    // Chart may fail to load for invalid syntax — that's expected
  }
}

// --- Scenarios ---

async function scenarioNormalEditorFlow(page: Page) {
  console.log("\n=== Scenario: Normal Editor Flow ===");

  // 1. Navigate to home — loads default diagram
  console.log("  Opening sprite.link...");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await waitForChartLoad(page);
  console.log("  Default chart loaded.");
  await randomDelay(2000, 4000);

  // 2. Re-fetch the same default diagram (cached hit)
  console.log("  Reloading page for cache hit...");
  await page.reload({ waitUntil: "networkidle" });
  await waitForChartLoad(page);
  console.log("  Cache hit — default chart reloaded.");
  await randomDelay(1000, 2000);

  // 3. Write a unique sequence diagram (cache miss)
  console.log("  Typing unique sequence diagram...");
  const seqDiagram = uniqueSequenceDiagram();
  let prevSrc = await getChartSrc(page);
  await typeInEditor(page, seqDiagram);
  await randomDelay(1000, 2000);
  await waitForChartUpdate(page, prevSrc);
  console.log("  Sequence diagram rendered (cache miss).");
  await randomDelay(2000, 5000);

  // 4. Write a unique class diagram (cache miss)
  console.log("  Typing unique class diagram...");
  prevSrc = await getChartSrc(page);
  await typeInEditor(page, uniqueClassDiagram());
  await randomDelay(1000, 2000);
  await waitForChartUpdate(page, prevSrc);
  console.log("  Class diagram rendered (cache miss).");
  await randomDelay(2000, 4000);

  // 5. Go back to the sequence diagram (cache hit — same encoded URL)
  console.log("  Switching back to sequence diagram (cache hit)...");
  prevSrc = await getChartSrc(page);
  await setEditorValue(page, seqDiagram);
  await waitForChartUpdate(page, prevSrc);
  console.log("  Sequence diagram re-rendered from cache.");
  await randomDelay(1000, 3000);

  // 6. Switch back to the default flowchart (cache hit — rendered earlier)
  console.log("  Switching to default flowchart (cache hit)...");
  prevSrc = await getChartSrc(page);
  await setEditorValue(page, defaultFlowchart);
  await waitForChartUpdate(page, prevSrc);
  console.log("  Default flowchart re-rendered from cache.");
  await randomDelay(1000, 2000);

  // 7. Rapidly toggle between two cached diagrams
  console.log("  Rapid toggle: sequence → default → sequence (cache hits)...");
  for (const [label, code] of [
    ["sequence", seqDiagram],
    ["default", defaultFlowchart],
    ["sequence", seqDiagram],
  ] as const) {
    prevSrc = await getChartSrc(page);
    await setEditorValue(page, code);
    await waitForChartUpdate(page, prevSrc);
    console.log(`    ${label} diagram loaded (cache hit).`);
    await randomDelay(500, 1500);
  }
}

async function scenarioSyntaxError(page: Page) {
  console.log("\n=== Scenario: Syntax Error & Recovery ===");

  // 1. Type invalid syntax
  console.log("  Typing invalid mermaid syntax...");
  let prevSrc = await getChartSrc(page);
  await typeInEditor(page, invalidSyntax);
  await randomDelay(1000, 2000);
  await waitForChartUpdate(page, prevSrc);
  console.log("  Invalid syntax submitted — error expected.");
  await randomDelay(3000, 5000);

  // 2. Fix the syntax
  console.log("  Fixing syntax...");
  prevSrc = await getChartSrc(page);
  await typeInEditor(page, fixedSyntax());
  await randomDelay(1000, 2000);
  await waitForChartUpdate(page, prevSrc);
  console.log("  Syntax fixed — chart recovered.");
  await randomDelay(2000, 4000);
}

async function scenarioShareFlow(page: Page) {
  console.log("\n=== Scenario: Share / Copy Embed URL ===");

  // Make sure we have a valid diagram loaded
  console.log("  Loading a diagram first...");
  const prevSrc = await getChartSrc(page);
  await setEditorValue(page, defaultFlowchart);
  await waitForChartUpdate(page, prevSrc);
  await randomDelay(1000, 2000);

  // Click the copy button
  const copyButton = page.locator("button", { hasText: "Copy" });
  if (await copyButton.isVisible()) {
    console.log("  Clicking Copy button...");
    await copyButton.click();
    await randomDelay(1000, 2000);
    console.log("  Embed URL copied.");
  } else {
    console.log("  Copy button not visible (mobile view?) — skipping.");
  }

  // Click the embed URL input to select it
  const embedInput = page.locator("#shareLink");
  if (await embedInput.isVisible()) {
    console.log("  Focusing embed URL input...");
    await embedInput.focus();
    await randomDelay(500, 1000);
  }
}

async function fetchEmbed(code: string, label: string) {
  const url = `${BASE_URL}/chart/${encode(code)}.png`;
  console.log(`  Fetching embed: ${label}...`);
  const start = Date.now();
  try {
    const res = await fetch(url);
    const elapsed = Date.now() - start;
    console.log(
      `    ${res.status} ${res.statusText} — ${elapsed}ms — ${res.headers.get("content-type")}`
    );
  } catch (err) {
    console.log(`    Error: ${err}`);
  }
  await randomDelay(500, 2000);
}

function randomInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function scenarioEmbedSimulation() {
  console.log("\n=== Scenario: Embed Simulation (direct PNG fetch) ===");

  // Generate a pool of unique diagrams for this run
  const uniqueDiagrams = Array.from({ length: randomInt(3, 6) }, (_, i) =>
    pick([uniqueSequenceDiagram, uniqueClassDiagram, uniqueStateDiagram, fixedSyntax])()
  );

  // Phase 1: Initial fetches — cache misses
  console.log("  Phase 1: Initial fetches (cache misses)...");
  await fetchEmbed(defaultFlowchart, "default flowchart (likely cached)");
  for (let i = 0; i < uniqueDiagrams.length; i++) {
    await fetchEmbed(uniqueDiagrams[i], `unique diagram ${i + 1} (cache miss)`);
  }

  // Phase 2: Re-fetch everything — cache hits
  console.log("  Phase 2: Re-fetches (cache hits)...");
  const allDiagrams = [defaultFlowchart, ...uniqueDiagrams];
  const hitCount = randomInt(allDiagrams.length, allDiagrams.length * 3);
  for (let i = 0; i < hitCount; i++) {
    await fetchEmbed(pick(allDiagrams), `cached diagram (hit ${i + 1}/${hitCount})`);
  }

  // Phase 3: A few more unique ones — cache misses mixed with hits
  console.log("  Phase 3: Mixed traffic...");
  const extraMisses = randomInt(1, 3);
  for (let i = 0; i < extraMisses; i++) {
    const fresh = pick([uniqueSequenceDiagram, uniqueClassDiagram, uniqueStateDiagram])();
    await fetchEmbed(fresh, `new diagram (cache miss)`);
    // Immediately re-fetch for a hit
    if (Math.random() > 0.3) {
      await fetchEmbed(fresh, `same diagram (cache hit)`);
    }
  }

  // Phase 4: Final burst of cached requests
  const burstSize = randomInt(3, 8);
  console.log(`  Phase 4: Final burst of ${burstSize} cached requests...`);
  for (let i = 0; i < burstSize; i++) {
    await fetchEmbed(pick(allDiagrams), `burst ${i + 1}/${burstSize} (cache hit)`);
  }
}

// --- Main ---

async function main() {
  console.log("Starting synthetic simulation against", BASE_URL);
  console.log("Headed mode:", HEADED ? "ON" : "OFF");

  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 SpriteBot/synthetic",
    permissions: ["clipboard-read", "clipboard-write"],
  });

  const page = await context.newPage();

  try {
    await scenarioNormalEditorFlow(page);
    await scenarioSyntaxError(page);
    await scenarioShareFlow(page);
  } finally {
    // Give Dynatrace RUM time to flush beacons before closing
    console.log("\n  Waiting for RUM beacon flush...");
    await sleep(5000);
    await page.close();
    await context.close();
    await browser.close();
  }

  // Embed simulation uses fetch, no browser needed
  await scenarioEmbedSimulation();

  console.log("\nDone. Check Dynatrace for new sessions and traces.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Simulation failed:", err);
    process.exit(1);
  });
