/**
 * Copy Stockfish.js 19 lite engines (NNUE embedded, ~1.7MB) into public/engines.
 * Official recommendation for in-browser analysis. No external .nnue download.
 */
import { cpSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const outDir = join(webRoot, "public", "engines");

let stockfishRoot;
try {
  stockfishRoot = dirname(require.resolve("stockfish/package.json"));
} catch {
  console.error("stockfish package not found. Run pnpm install");
  process.exit(1);
}

const binDir = join(stockfishRoot, "bin");
const files = [
  "stockfish-19-lite-single.js",
  "stockfish-19-lite-single.wasm",
  "stockfish-19-lite.js",
  "stockfish-19-lite.wasm",
];

mkdirSync(outDir, { recursive: true });

// Remove old SF16 artifacts that caused 38MB NNUE hangs
for (const stale of [
  "stockfish-nnue-16-single.js",
  "stockfish-nnue-16-single.wasm",
  "stockfish-nnue-16.js",
  "stockfish-nnue-16.wasm",
  "stockfish.js",
  "nn-5af11540bbfe.nnue",
]) {
  const p = join(outDir, stale);
  if (existsSync(p)) {
    rmSync(p);
    console.log(`removed stale ${stale}`);
  }
}

for (const file of files) {
  const from = join(binDir, file);
  if (!existsSync(from)) {
    console.error(`Missing ${from}`);
    process.exit(1);
  }
  cpSync(from, join(outDir, file));
  console.log(`copied ${file}`);
}
