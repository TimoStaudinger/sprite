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

async function setEditorValue(page: Page, code: string) {
  await page.evaluate((c: string) => {
    const models = (window as any).monaco?.editor?.getModels?.();
    if (models?.[0]) {
      models[0].setValue(c);
    }
  }, code);
}

async function typeInEditor(page: Page, code: string) {
  // Clear and type character by character to simulate real editing
  await setEditorValue(page, "");
  await sleep(300);

  // Type in chunks to balance realism with speed
  const chunkSize = 15;
  for (let i = 0; i < code.length; i += chunkSize) {
    const chunk = code.slice(i, i + chunkSize);
    await page.evaluate(
      ({ chunk: c, pos }: { chunk: string; pos: number }) => {
        const models = (window as any).monaco?.editor?.getModels?.();
        if (models?.[0]) {
          const current = models[0].getValue();
          models[0].setValue(current + c);
        }
      },
      { chunk, pos: i }
    );
    await sleep(50 + Math.random() * 100);
  }
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

async function waitForChartUpdate(page: Page, timeoutMs = 30000) {
  // Wait for the loading state to appear and then resolve
  try {
    await page.waitForFunction(
      () => {
        const img = document.querySelector(
          'img[alt="Chart preview"]'
        ) as HTMLImageElement | null;
        return img && img.complete && img.naturalWidth > 0;
      },
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
  await typeInEditor(page, seqDiagram);
  await randomDelay(1000, 2000);
  await waitForChartUpdate(page);
  console.log("  Sequence diagram rendered (cache miss).");
  await randomDelay(2000, 5000);

  // 4. Write a unique class diagram (cache miss)
  console.log("  Typing unique class diagram...");
  await typeInEditor(page, uniqueClassDiagram());
  await randomDelay(1000, 2000);
  await waitForChartUpdate(page);
  console.log("  Class diagram rendered (cache miss).");
  await randomDelay(2000, 4000);

  // 5. Go back to the sequence diagram (cache hit — same encoded URL)
  console.log("  Switching back to sequence diagram (cache hit)...");
  await setEditorValue(page, seqDiagram);
  await waitForChartUpdate(page);
  console.log("  Sequence diagram re-rendered from cache.");
  await randomDelay(1000, 3000);
}

async function scenarioSyntaxError(page: Page) {
  console.log("\n=== Scenario: Syntax Error & Recovery ===");

  // 1. Type invalid syntax
  console.log("  Typing invalid mermaid syntax...");
  await typeInEditor(page, invalidSyntax);
  await randomDelay(1000, 2000);
  await waitForChartUpdate(page);
  console.log("  Invalid syntax submitted — error expected.");
  await randomDelay(3000, 5000);

  // 2. Fix the syntax
  console.log("  Fixing syntax...");
  await typeInEditor(page, fixedSyntax());
  await randomDelay(1000, 2000);
  await waitForChartUpdate(page);
  console.log("  Syntax fixed — chart recovered.");
  await randomDelay(2000, 4000);
}

async function scenarioShareFlow(page: Page) {
  console.log("\n=== Scenario: Share / Copy Embed URL ===");

  // Make sure we have a valid diagram loaded
  console.log("  Loading a diagram first...");
  await setEditorValue(page, defaultFlowchart);
  await waitForChartUpdate(page);
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

async function scenarioEmbedSimulation() {
  console.log("\n=== Scenario: Embed Simulation (direct PNG fetch) ===");

  const diagrams = [
    { name: "default flowchart (likely cached)", code: defaultFlowchart },
    { name: "default flowchart again (cache hit)", code: defaultFlowchart },
    { name: "unique diagram (cache miss)", code: fixedSyntax() },
    { name: "another unique diagram (cache miss)", code: uniqueSequenceDiagram() },
  ];

  for (const { name, code } of diagrams) {
    const url = `${BASE_URL}/chart/${encode(code)}.png`;
    console.log(`  Fetching embed: ${name}...`);
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
    await randomDelay(2000, 5000);
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

main().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
