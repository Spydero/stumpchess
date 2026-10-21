/**
 * Capture desktop screenshots of every stumpchess page into docs/screenshots/.
 *
 *   pnpm screenshots
 *
 * Uses 1440×900 viewport + fullPage so tall pages are not cropped.
 * Requires web on :3000. Owner defaults: jojo@local.dev / OwnerChangeMe123!
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

/** Clear previous docs shots so stale cropped files are not left behind. */
function resetOutDir() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of fs.readdirSync(OUT)) {
    if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".webp")) {
      fs.unlinkSync(path.join(OUT, name));
    }
  }
}

async function shot(page, name, waitMs = 500) {
  await page.addStyleTag({ content: HIDE_OVERLAYS }).catch(() => null);
  await page.waitForTimeout(waitMs);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true, type: "png" });
  const box = await page.evaluate(() => {
    const h = Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0
    );
    return `${window.innerWidth}x${window.innerHeight} page~${h}px`;
  });
  console.log("wrote", name, box);
}

async function goto(page, route) {
  // Prefer load over networkidle: live game / Stockfish workers keep the network busy.
  await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(500);
}

async function firstHref(page, selector) {
  const href = await page.locator(selector).first().getAttribute("href").catch(() => null);
  return href;
}

async function main() {
  resetOutDir();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  // --- Public / auth ---
  await goto(page, "/login");
  await shot(page, "02-login.png");

  await goto(page, "/register");
  await shot(page, "03-register.png");

  // Login as Owner
  await goto(page, "/login");
  await page.fill('input[placeholder="Email"]', EMAIL);
  await page.fill('input[placeholder="Password"]', PASS);
  await page.click('button:has-text("Login")');
  await page.waitForTimeout(1400);

  // --- Core pages ---
  const staticAuthed = [
    ["/", "01-home.png"],
    ["/play", "04-play.png"],
    ["/watch", "05-watch.png"],
    ["/tournaments", "06-tournaments.png"],
    ["/openings", "07-openings.png"],
    ["/practice", "08-practice.png"],
    ["/practice?mode=coach", "09-practice-coach.png", 2200],
    ["/practice/mistakes", "10-practice-mistakes.png"],
    ["/games", "11-games.png"],
    ["/analysis", "12-analysis.png"],
    ["/forum", "13-forum.png"],
    ["/messages", "14-messages.png"],
    ["/leaders", "15-leaders.png"],
    ["/search", "16-search.png"],
    ["/settings", "17-settings.png"],
    ["/admin", "18-admin.png"],
    ["/u/jOjo", "19-profile-owner.png"],
  ];

  for (const row of staticAuthed) {
    const [route, file, waitMs] = row;
    try {
      await goto(page, route);
      await shot(page, file, waitMs || 700);
    } catch (e) {
      console.warn("failed", file, e instanceof Error ? e.message : e);
    }
  }

  // --- Dynamic: tournament detail ---
  await goto(page, "/tournaments");
  let tourHref = await firstHref(page, 'a[href^="/tournaments/"]');
  if (!tourHref) {
    // Create a demo event from the UI if the create form exists
    const nameInput = page.locator('input[name="name"], input[placeholder*="Name" i]').first();
    if (await nameInput.count()) {
      await nameInput.fill("Club Swiss Demo");
      const createBtn = page.locator('button:has-text("Create"), button:has-text("Host")').first();
      if (await createBtn.count()) {
        await createBtn.click();
        await page.waitForTimeout(1200);
        tourHref = page.url().includes("/tournaments/")
          ? page.url().replace(BASE, "")
          : await firstHref(page, 'a[href^="/tournaments/"]');
      }
    }
  }
  if (tourHref) {
    await goto(page, tourHref);
    await shot(page, "20-tournament-detail.png", 900);
  } else {
    console.warn("skip 20-tournament-detail.png (no tournament)");
  }

  // --- Dynamic: game detail ---
  await goto(page, "/games");
  let gameHref = await firstHref(page, 'a[href^="/game/"]');
  if (!gameHref) {
    // Start a bot game from Play so we have something to show
    await goto(page, "/play");
    const start = page.locator('button:has-text("Start game")').first();
    if (await start.count()) {
      await start.click();
      await page.waitForTimeout(2000);
      if (page.url().includes("/game/")) {
        gameHref = page.url().replace(BASE, "");
      }
    }
  }
  if (gameHref) {
    try {
      await goto(page, gameHref);
      await shot(page, "21-game-board.png", 1500);
    } catch (e) {
      console.warn("failed 21-game-board.png", e instanceof Error ? e.message : e);
    }
  } else {
    console.warn("skip 21-game-board.png (no game)");
  }

  // --- Dynamic: forum category + thread ---
  await goto(page, "/forum");
  const catHref = await firstHref(page, 'a[href^="/forum/"]:not([href*="/thread/"])');
  if (catHref) {
    await goto(page, catHref);
    await shot(page, "22-forum-category.png", 800);

    let threadHref = await firstHref(page, 'a[href^="/forum/thread/"]');
    if (!threadHref) {
      const newBtn = page.locator('button:has-text("New thread")').first();
      if (await newBtn.count()) {
        await newBtn.click();
        await page.waitForTimeout(300);
        await page.fill('input[name="title"]', "Welcome to stumpchess");
        await page.fill('textarea[name="body"]', "Share games, ask questions, and talk theory.");
        await page.click('button:has-text("Post thread")');
        await page.waitForTimeout(1400);
        threadHref = page.url().includes("/forum/thread/")
          ? page.url().replace(BASE, "")
          : await firstHref(page, 'a[href^="/forum/thread/"]');
      }
    }
    if (threadHref) {
      await goto(page, threadHref);
      await shot(page, "23-forum-thread.png", 800);
    } else {
      console.warn("skip 23-forum-thread.png (no thread)");
    }
  } else {
    console.warn("skip forum category/thread");
  }

  // --- Dynamic: message thread ---
  await goto(page, "/messages");
  let msgHref = await firstHref(page, 'a[href^="/messages/"]');
  if (!msgHref) {
    const userBox = page.locator('input[placeholder="username"]').first();
    if (await userBox.count()) {
      await userBox.fill("member1");
      await page.click('button:has-text("Open chat")');
      await page.waitForTimeout(1400);
      if (page.url().includes("/messages/")) {
        msgHref = page.url().replace(BASE, "");
        const composer = page.locator("textarea, input[placeholder*='message' i]").first();
        if (await composer.count()) {
          await composer.fill("Hey, welcome to the club.");
          const send = page.locator('button:has-text("Send"), button[type="submit"]').first();
          if (await send.count()) await send.click();
          await page.waitForTimeout(600);
        }
      }
    }
  }
  if (msgHref) {
    await goto(page, msgHref);
    await shot(page, "24-messages-thread.png", 800);
  } else {
    console.warn("skip 24-messages-thread.png (no conversation)");
  }

  await browser.close();

  const files = fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).sort();
  console.log(`done → ${OUT} (${files.length} files)`);
  for (const f of files) console.log(" ", f);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
