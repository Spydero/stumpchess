/**
 * Capture desktop docs screenshots (1440×900) into docs/screenshots/.
 *
 *   pnpm screenshots
 *
 * Requires web on :3000 and Owner credentials (defaults below).
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "screenshots");
const BASE = process.env.APP_URL || "http://localhost:3000";
const EMAIL = process.env.OWNER_EMAIL || "jojo@local.dev";
const PASS = process.env.OWNER_PASSWORD || "OwnerChangeMe123!";

const HIDE_OVERLAYS = `
  nextjs-portal, [data-nextjs-toast], [data-next-mark-loading],
  #__next-build-watcher, [data-nextjs-dialog-overlay] {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
`;

async function shot(page, name) {
  await page.addStyleTag({ content: HIDE_OVERLAYS }).catch(() => null);
  await page.waitForTimeout(350);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({
    path: path.join(OUT, name),
    fullPage: false,
    type: "png",
  });
  const box = await page.evaluate(() => `${window.innerWidth}x${window.innerHeight}`);
  console.log("wrote", name, box);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await shot(page, "02-login.png");

  await page.fill('input[placeholder="Email"]', EMAIL);
  await page.fill('input[placeholder="Password"]', PASS);
  await page.click('button:has-text("Login")');
  await page.waitForTimeout(1200);

  for (const [route, file] of [
    ["/", "01-home.png"],
    ["/play", "03-play.png"],
    ["/analysis", "04-analysis-vip.png"],
    ["/forum", "05-forum.png"],
    ["/u/jOjo", "06-owner-profile.png"],
    ["/admin", "07-admin.png"],
    ["/practice", "08-practice.png"],
  ]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(route === "/practice" ? 2000 : 900);
    await shot(page, file);
  }

  await browser.close();
  console.log("done →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
