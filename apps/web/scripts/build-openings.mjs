/**
 * Build a compact openings trie from vendored lichess-org/chess-openings TSV.
 * Output: apps/web/src/data/openings-book.json
 *
 * Usage: node scripts/build-openings.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tsvDir = join(root, "data/chess-openings");
const outPath = join(root, "src/data/openings-book.json");

const require = createRequire(import.meta.url);
const { Chess } = require("chess.js");

/** @typedef {{ eco?: string, name?: string, n: number, c: Record<string, object> }} Node */

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function parseTsv(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (i === 0 && /^eco\t/i.test(line)) continue;
    const tab1 = line.indexOf("\t");
    const tab2 = line.indexOf("\t", tab1 + 1);
    if (tab1 < 0 || tab2 < 0) continue;
    const eco = line.slice(0, tab1).trim();
    const name = line.slice(tab1 + 1, tab2).trim();
    const pgn = line.slice(tab2 + 1).trim();
    if (!eco || !name || !pgn) continue;
    rows.push({ eco, name, pgn });
  }
  return rows;
}

/** Replay PGN move text (no headers) → UCI list */
function pgnToUci(pgn) {
  const chess = new Chess();
  const cleaned = pgn
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .replace(/[!?+#]/g, "")
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ")
    .trim();
  if (!cleaned) return null;

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const uci = [];
  for (const san of tokens) {
    let move;
    try {
      move = chess.move(san, { strict: false });
    } catch {
      move = null;
    }
    if (!move) return null;
    uci.push(move.from + move.to + (move.promotion || ""));
  }
  return uci;
}

function bumpPath(rootNode, uciPath, eco, name) {
  let node = rootNode;
  node.n += 1;
  for (let i = 0; i < uciPath.length; i++) {
    const u = uciPath[i];
    if (!node.c[u]) node.c[u] = { n: 0, c: {} };
    node = node.c[u];
    node.n += 1;
    // Deepest matching opening wins at this node
    if (i === uciPath.length - 1) {
      node.eco = eco;
      node.name = name;
    }
  }
}

function inheritOpenings(node, parentEco, parentName) {
  if (!node.eco && parentEco) {
    node.eco = parentEco;
    node.name = parentName;
  }
  for (const child of Object.values(node.c)) {
    inheritOpenings(child, node.eco, node.name);
  }
}

function compact(node) {
  /** @type {Record<string, unknown>} */
  const out = { n: node.n };
  if (node.eco) out.eco = node.eco;
  if (node.name) out.name = node.name;
  const keys = Object.keys(node.c);
  if (keys.length) {
    /** @type {Record<string, unknown>} */
    const children = {};
    for (const k of keys) children[k] = compact(node.c[k]);
    out.c = children;
  }
  return out;
}

function main() {
  if (!existsSync(tsvDir)) {
    console.error("Missing", tsvDir);
    process.exit(1);
  }

  const files = readdirSync(tsvDir)
    .filter((f) => /^[a-e]\.tsv$/i.test(f))
    .sort();
  if (!files.length) {
    console.error("No a.tsv–e.tsv in", tsvDir);
    process.exit(1);
  }

  /** @type {Node} */
  const rootNode = { n: 0, c: {} };
  let ok = 0;
  let fail = 0;

  for (const file of files) {
    const rows = parseTsv(readFileSync(join(tsvDir, file), "utf8"));
    for (const row of rows) {
      const uci = pgnToUci(row.pgn);
      if (!uci || !uci.length) {
        fail++;
        continue;
      }
      bumpPath(rootNode, uci, row.eco, row.name);
      ok++;
    }
  }

  inheritOpenings(rootNode, undefined, undefined);
  const book = {
    v: 1,
    source: "lichess-org/chess-openings",
    license: "CC0-1.0",
    lines: ok,
    root: compact(rootNode),
  };

  ensureDir(dirname(outPath));
  writeFileSync(outPath, JSON.stringify(book));
  const kb = Math.round(Buffer.byteLength(JSON.stringify(book)) / 1024);
  console.log(`openings-book.json: ${ok} lines (${fail} skipped), ~${kb} KB → ${outPath}`);
}

main();
