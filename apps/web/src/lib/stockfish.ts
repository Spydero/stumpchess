"use client";

/**
 * Stockfish.js 19 lite (Chess.com WASM build for browsers).
 * https://github.com/nmrugg/stockfish.js
 *
 * Lite has NNUE embedded (~1.7MB). No EvalFile download. No queue pause.
 * Still far stronger than any human; built for local analysis speed.
 */

export type PvLine = {
  rank: number;
  uci: string;
  scoreCp?: number;
  mate?: number;
  depth?: number;
  pv?: string;
};

export type EngineInfo = {
  bestMove?: string;
  scoreCp?: number;
  mate?: number;
  depth?: number;
  pv?: string;
  secondScoreCp?: number;
  secondMate?: number;
  secondBestMove?: string;
  pvs: PvLine[];
};

type MultipvLine = {
  multipv: number;
  scoreCp?: number;
  mate?: number;
  depth?: number;
  pv?: string;
};

export type StockfishEngine = ReturnType<typeof createStockfish>;

function asLine(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "data" in (data as object)) {
    return String((data as { data: unknown }).data);
  }
  return String(data ?? "");
}

export function stmScore(scoreCp?: number, mate?: number): number {
  if (mate !== undefined) {
    const mag = 100000 - Math.abs(mate) * 100;
    return mate > 0 ? mag : -mag;
  }
  return scoreCp ?? 0;
}

export function canUseMultiThreadEngine(): boolean {
  try {
    return (
      typeof SharedArrayBuffer !== "undefined" &&
      typeof Atomics !== "undefined" &&
      typeof crossOriginIsolated !== "undefined" &&
      crossOriginIsolated
    );
  } catch {
    return false;
  }
}

function createWorker(multi: boolean): Worker {
  // Hash fragment tells emscripten where the .wasm lives (required in Workers).
  const base = multi ? "/engines/stockfish-19-lite" : "/engines/stockfish-19-lite-single";
  const origin = typeof location !== "undefined" ? location.origin : "";
  const wasm = `${origin}${base}.wasm`;
  return new Worker(`${base}.js#${encodeURIComponent(wasm)}`);
}

export function createStockfish(opts?: { forceSingle?: boolean }) {
  const multi = !opts?.forceSingle && canUseMultiThreadEngine();
  const threads = multi
    ? Math.min(4, Math.max(2, typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2))
    : 1;
  const worker = createWorker(multi);

  let resolver: ((info: EngineInfo) => void) | null = null;
  let latest: EngineInfo = { pvs: [] };
  let lines: Record<number, MultipvLine> = {};
  let ready = false;
  let readyWaiters: Array<() => void> = [];
  let onInfo: ((info: EngineInfo) => void) | null = null;
  let searching = false;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumps on each new analyze/stop/dispose so late bestmove can't finish the wrong search. */
  let searchEpoch = 0;
  let activeEpoch = 0;
  let configured = false;
  let engineName = "stockfish-19-lite";
  let hashMb = 32;
  let multipvOpt = 1;

  const flushReady = () => {
    ready = true;
    const waiters = readyWaiters;
    readyWaiters = [];
    waiters.forEach((w) => w());
  };

  const waitReady = () =>
    new Promise<void>((resolve) => {
      if (ready) resolve();
      else readyWaiters.push(resolve);
    });

  const pingReady = () =>
    new Promise<void>((resolve) => {
      ready = false;
      readyWaiters.push(resolve);
      worker.postMessage("isready");
      setTimeout(() => {
        if (!ready) flushReady();
      }, 5000);
    });

  const buildPvs = (): PvLine[] => {
    const raw = Object.values(lines)
      .filter((l) => l.pv)
      .map((l) => ({
        rank: l.multipv,
        uci: (l.pv || "").split(/\s+/)[0] || "",
        scoreCp: l.scoreCp,
        mate: l.mate,
        depth: l.depth,
        pv: l.pv,
      }))
      .filter((l) => l.uci);
    if (!raw.length) return [];
    const maxD = Math.max(...raw.map((l) => l.depth || 0));
    return raw
      .filter((l) => (l.depth || 0) >= Math.max(1, maxD - 2))
      .sort((a, b) => a.rank - b.rank);
  };

  const buildInfo = (): EngineInfo => {
    const pvs = buildPvs();
    const primary = lines[1] || Object.values(lines).sort((a, b) => a.multipv - b.multipv)[0] || {};
    const second = pvs[1];
    const pvFirst = primary.pv?.split(/\s+/)[0];
    return {
      bestMove: latest.bestMove || pvFirst || pvs[0]?.uci,
      scoreCp: primary.scoreCp,
      mate: primary.mate,
      depth: primary.depth ?? latest.depth,
      pv: primary.pv,
      secondScoreCp: second?.scoreCp,
      secondMate: second?.mate,
      secondBestMove: second?.uci,
      pvs,
    };
  };

  const finishSearch = (info: EngineInfo, epoch: number) => {
    if (epoch !== activeEpoch) return;
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    searching = false;
    const r = resolver;
    resolver = null;
    onInfo = null;
    r?.(info);
  };

  worker.onmessage = (e: MessageEvent) => {
    const raw = asLine(e.data);
    for (const text of raw.split("\n").map((s) => s.trim()).filter(Boolean)) {
      if (text.startsWith("id name ")) {
        engineName = text.slice("id name ".length).trim();
        continue;
      }
      if (text === "uciok" || text === "readyok") {
        flushReady();
        continue;
      }

      if (text.startsWith("info ") && text.includes(" score ") && text.includes(" pv ")) {
        if (/\blowerbound\b|\bupperbound\b/.test(text)) continue;
        const multipv = Number(/ multipv (\d+)/.exec(text)?.[1] || "1");
        const depthStr = / depth (\d+)/.exec(text)?.[1];
        const mateStr = / score mate (-?\d+)/.exec(text)?.[1];
        const cpStr = / score cp (-?\d+)/.exec(text)?.[1];
        const pv = / pv (.+)$/.exec(text)?.[1];
        if (!pv) continue;
        const d = depthStr ? Number(depthStr) : undefined;
        const prev = lines[multipv] || { multipv };
        if (prev.depth !== undefined && d !== undefined && d < prev.depth) continue;
        lines[multipv] = {
          multipv,
          depth: d ?? prev.depth,
          mate: mateStr !== undefined ? Number(mateStr) : cpStr !== undefined ? undefined : prev.mate,
          scoreCp: cpStr !== undefined ? Number(cpStr) : mateStr !== undefined ? undefined : prev.scoreCp,
          pv,
        };
        // Only materialize EngineInfo when a listener cares (avoids main-thread churn)
        if (onInfo && activeEpoch === searchEpoch) {
          const info = buildInfo();
          latest = { ...info, depth: d ?? info.depth };
          onInfo(info);
        } else if (d !== undefined) {
          latest = { ...latest, depth: d };
        }
        continue;
      }

      if (text.startsWith("bestmove ")) {
        if (!resolver && !searching) continue;
        const epoch = activeEpoch;
        const built = buildInfo();
        const best = text.split(/\s+/)[1];
        const info = {
          ...built,
          bestMove: !best || best === "(none)" ? built.bestMove : best,
        };
        latest = info;
        finishSearch(info, epoch);
      }
    }
  };

  worker.onerror = (err) => {
    console.error("Stockfish worker error", err);
    finishSearch(buildInfo(), activeEpoch);
  };

  worker.postMessage("uci");

  async function ensureConfigured() {
    await waitReady();
    if (configured) return;
    worker.postMessage("setoption name UCI_AnalyseMode value true");
    worker.postMessage("setoption name UCI_LimitStrength value false");
    if (multi) worker.postMessage(`setoption name Threads value ${threads}`);
    worker.postMessage(`setoption name Hash value ${hashMb}`);
    worker.postMessage(`setoption name MultiPV value ${multipvOpt}`);
    worker.postMessage("ucinewgame");
    await pingReady();
    configured = true;
  }

  async function applyHashAndMultipv(hash?: number, multipv?: number) {
    if (hash !== undefined && hash !== hashMb) {
      hashMb = Math.max(16, Math.min(256, hash));
      worker.postMessage(`setoption name Hash value ${hashMb}`);
    }
    if (multipv !== undefined && multipv !== multipvOpt) {
      multipvOpt = Math.max(1, Math.min(5, multipv));
      worker.postMessage(`setoption name MultiPV value ${multipvOpt}`);
    }
  }

  return {
    get meta() {
      return {
        multiThread: multi,
        threads,
        engine: "stockfish-19-lite" as const,
        name: engineName,
      };
    },
    async configureAnalysis(opts?: { hash?: number; multipv?: number }) {
      await ensureConfigured();
      await applyHashAndMultipv(opts?.hash, opts?.multipv);
      await pingReady();
    },
    async configure(skill: number, elo: number, opts?: { multipv?: number; hash?: number }) {
      await ensureConfigured();
      const s = Math.max(0, Math.min(20, skill));
      // Use UCI_Elo alone for capped strength. Stacking a low Skill Level on top
      // made bots play well below the advertised Elo.
      if (s >= 20) {
        worker.postMessage("setoption name UCI_LimitStrength value false");
        worker.postMessage("setoption name Skill Level value 20");
      } else {
        worker.postMessage("setoption name Skill Level value 20");
        worker.postMessage("setoption name UCI_LimitStrength value true");
        worker.postMessage(`setoption name UCI_Elo value ${Math.max(800, Math.min(2850, elo))}`);
      }
      await applyHashAndMultipv(opts?.hash ?? 32, opts?.multipv ?? 1);
      await pingReady();
    },
    /**
     * Stockfish lane: settable Elo, MultiPV for free-floating among near-best.
     * elo <= 0 or > 2850 → unlimited strength.
     */
    async configureEngine(elo: number, opts?: { hash?: number; multipv?: number }) {
      await ensureConfigured();
      worker.postMessage("setoption name Skill Level value 20");
      if (!Number.isFinite(elo) || elo <= 0 || elo > 2850) {
        worker.postMessage("setoption name UCI_LimitStrength value false");
      } else {
        worker.postMessage("setoption name UCI_LimitStrength value true");
        worker.postMessage(
          `setoption name UCI_Elo value ${Math.max(800, Math.min(2850, Math.round(elo)))}`
        );
      }
      await applyHashAndMultipv(opts?.hash ?? 64, opts?.multipv ?? 3);
      await pingReady();
    },
    /** Full-strength analysis engine (for live hints / practice). */
    async configureCoach(opts?: { multipv?: number; hash?: number }) {
      await ensureConfigured();
      worker.postMessage("setoption name UCI_LimitStrength value false");
      worker.postMessage("setoption name Skill Level value 20");
      await applyHashAndMultipv(opts?.hash ?? 32, opts?.multipv ?? 2);
      await pingReady();
    },
    setSkill(level: number) {
      worker.postMessage(`setoption name Skill Level value ${Math.max(0, Math.min(20, level))}`);
    },
    async analyze(
      fen: string,
      opts: {
        depth?: number;
        movetime?: number;
        onUpdate?: (info: EngineInfo) => void;
      } = {}
    ): Promise<EngineInfo> {
      await ensureConfigured();

      const epoch = ++searchEpoch;
      if (searching) {
        worker.postMessage("stop");
        // Resolve the previous waiter so callers don't hang
        if (resolver) {
          const prev = resolver;
          resolver = null;
          onInfo = null;
          searching = false;
          prev(buildInfo());
        }
        await new Promise((r) => setTimeout(r, 30));
      }
      if (epoch !== searchEpoch) {
        return { pvs: [] };
      }

      latest = { pvs: [] };
      lines = {};
      onInfo = opts.onUpdate || null;
      searching = true;
      activeEpoch = epoch;

      const depth = opts.depth ?? 18;
      const movetime = opts.movetime;
      // Scale with depth so d22+ isn't cut off early on lite WASM
      const safetyMs = movetime
        ? Math.min(20000, movetime + 2000)
        : Math.min(20000, 2000 + depth * 350);

      return new Promise((resolve) => {
        if (epoch !== searchEpoch) {
          resolve({ pvs: [] });
          return;
        }
        resolver = resolve;
        searchTimer = setTimeout(() => {
          worker.postMessage("stop");
          setTimeout(() => {
            if (resolver && activeEpoch === epoch) finishSearch(buildInfo(), epoch);
          }, 100);
        }, safetyMs);

        worker.postMessage(`position fen ${fen}`);
        if (movetime && movetime > 0) {
          worker.postMessage(`go movetime ${Math.round(movetime)}`);
        } else {
          worker.postMessage(`go depth ${depth}`);
        }
      });
    },
    async bestMove(fen: string, opts: { depth?: number; movetime?: number } = {}) {
      const info = await this.analyze(fen, opts);
      return info.bestMove;
    },
    stop() {
      searchEpoch++;
      worker.postMessage("stop");
      if (resolver) {
        const r = resolver;
        resolver = null;
        onInfo = null;
        searching = false;
        if (searchTimer) {
          clearTimeout(searchTimer);
          searchTimer = null;
        }
        r(buildInfo());
      }
    },
    dispose() {
      searchEpoch++;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = null;
      if (resolver) {
        const r = resolver;
        resolver = null;
        onInfo = null;
        searching = false;
        r({ pvs: [] });
      }
      worker.terminate();
    },
  };
}

/**
 * Parallel FEN analysis. Emits moves as soon as consecutive evals are ready
 * so the UI fills while the rest of the game is still searching.
 */
/** Centipawn gap between PV1 and PV2 (side-to-move). */
export function bestGapCp(info: EngineInfo): number {
  const a = info.pvs[0];
  const b = info.pvs[1];
  if (!a || !b) return 0;
  return Math.abs(stmScore(a.scoreCp, a.mate) - stmScore(b.scoreCp, b.mate));
}

/** True when reported depth is within `slack` of the requested depth. */
export function depthReliable(info: EngineInfo | null | undefined, requested: number, slack = 2) {
  if (!info?.depth) return false;
  return info.depth >= Math.max(1, requested - slack);
}

export async function analyzeFenBatch(
  fens: string[],
  opts: {
    depth: number;
    concurrency?: number;
    multipv?: number;
    hash?: number;
    onProgress?: (done: number, total: number, lastDepth?: number) => void;
    /** Called whenever move index 0..k are classifiable (infos[0]..infos[k+1] ready) */
    onPairReady?: (moveIndex: number, before: EngineInfo, after: EngineInfo) => void;
    shouldCancel?: () => boolean;
  }
): Promise<EngineInfo[]> {
  const total = fens.length;
  if (!total) return [];

  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
  // Lite is small; 4 workers cuts wall-clock hard
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, cores, 4, total));
  const multipv = opts.multipv ?? 2;
  // Deep review benefits from more TT; keep modest per worker (×4)
  const hash = opts.hash ?? (opts.depth >= 20 ? 96 : opts.depth >= 18 ? 64 : 32);

  const engines: StockfishEngine[] = [];
  for (let i = 0; i < concurrency; i++) {
    engines.push(createStockfish({ forceSingle: true }));
  }

  try {
    await Promise.all(engines.map((e) => e.configureAnalysis({ hash, multipv })));

    const results: (EngineInfo | undefined)[] = new Array(total);
    let next = 0;
    let done = 0;
    let emitted = 0;

    function flushPairs() {
      while (
        emitted < total - 1 &&
        results[emitted] &&
        results[emitted + 1]
      ) {
        opts.onPairReady?.(emitted, results[emitted]!, results[emitted + 1]!);
        emitted++;
      }
    }

    async function runWorker(engine: StockfishEngine) {
      while (true) {
        if (opts.shouldCancel?.()) return;
        const i = next++;
        if (i >= total) return;
        const info = await engine.analyze(fens[i], { depth: opts.depth });
        results[i] = info;
        done++;
        opts.onProgress?.(done, total, info.depth);
        flushPairs();
      }
    }

    await Promise.all(engines.map((e) => runWorker(e)));
    flushPairs();
    return results.map((r) => r || { pvs: [] });
  } finally {
    engines.forEach((e) => e.dispose());
  }
}

export function uciToMove(uci: string): { from: string; to: string; promotion?: string } | null {
  if (!uci || uci.length < 4) return null;
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

export function toWhiteEval(turn: "w" | "b", scoreCp?: number, mate?: number): number {
  const s = stmScore(scoreCp, mate);
  return turn === "w" ? s : -s;
}

export function formatEval(whiteCp: number): string {
  if (Math.abs(whiteCp) >= 90000) {
    const mates =
      whiteCp > 0
        ? Math.ceil((100000 - whiteCp) / 100)
        : -Math.ceil((100000 + whiteCp) / 100);
    return mates === 0
      ? whiteCp > 0
        ? "M1"
        : "-M1"
      : whiteCp > 0
        ? `M${Math.abs(mates)}`
        : `-M${Math.abs(mates)}`;
  }
  const p = whiteCp / 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(2)}`;
}
