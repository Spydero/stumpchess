"use client";

export type EngineInfo = {
  bestMove?: string;
  scoreCp?: number;
  mate?: number;
  depth?: number;
  pv?: string;
  secondScoreCp?: number;
  secondMate?: number;
  secondBestMove?: string;
};

type MultipvLine = {
  multipv: number;
  scoreCp?: number;
  mate?: number;
  depth?: number;
  pv?: string;
};

function asLine(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "data" in (data as object)) {
    return String((data as { data: unknown }).data);
  }
  return String(data ?? "");
}

/**
 * Stockfish Web Worker from same origin (public/engines/stockfish.js).
 */
export function createStockfish() {
  const worker = new Worker("/engines/stockfish.js");

  let resolver: ((info: EngineInfo) => void) | null = null;
  let latest: EngineInfo = {};
  let lines: Record<number, MultipvLine> = {};
  let ready = false;
  let readyWaiters: Array<() => void> = [];
  let onInfo: ((info: EngineInfo) => void) | null = null;
  let searching = false;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

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

  /** Request a fresh readyok handshake */
  const pingReady = () =>
    new Promise<void>((resolve) => {
      ready = false;
      readyWaiters.push(resolve);
      worker.postMessage("isready");
      // safety: never block forever on handshake
      setTimeout(() => {
        if (!ready) flushReady();
      }, 3000);
    });

  const buildInfo = (): EngineInfo => {
    const primary = lines[1] || Object.values(lines)[0] || {};
    const second = lines[2];
    const pvFirst = primary.pv?.split(/\s+/)[0];
    return {
      bestMove: latest.bestMove || pvFirst,
      scoreCp: primary.scoreCp,
      mate: primary.mate,
      depth: primary.depth ?? latest.depth,
      pv: primary.pv,
      secondScoreCp: second?.scoreCp,
      secondMate: second?.mate,
      secondBestMove: second?.pv?.split(/\s+/)[0],
    };
  };

  const finishSearch = (info: EngineInfo) => {
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
    // Some builds emit multiple lines per message
    for (const line of raw.split("\n")) {
      const text = line.trim();
      if (!text) continue;

      if (text === "uciok" || text === "readyok") {
        flushReady();
      }

      if (text.startsWith("info ") && (text.includes(" score ") || text.includes(" depth "))) {
        const multipv = Number(/ multipv (\d+)/.exec(text)?.[1] || "1");
        const depth = / depth (\d+)/.exec(text)?.[1];
        const mate = / score mate (-?\d+)/.exec(text)?.[1];
        const cp = / score cp (-?\d+)/.exec(text)?.[1];
        const pvMatch = / pv (.+)$/.exec(text);
        const pv = pvMatch?.[1];
        const prev = lines[multipv] || { multipv };
        lines[multipv] = {
          multipv,
          depth: depth ? Number(depth) : prev.depth,
          mate: mate !== undefined ? Number(mate) : cp !== undefined ? undefined : prev.mate,
          scoreCp: cp !== undefined ? Number(cp) : mate !== undefined ? undefined : prev.scoreCp,
          pv: pv ?? prev.pv,
        };
        latest = { ...latest, ...buildInfo(), depth: depth ? Number(depth) : latest.depth };
        onInfo?.(buildInfo());
      }

      if (text.startsWith("bestmove ")) {
        // Ignore stray bestmove if we aren't waiting (e.g. after stop)
        if (!resolver && !searching) continue;
        const best = text.split(/\s+/)[1];
        const info = {
          ...buildInfo(),
          bestMove: !best || best === "(none)" ? buildInfo().bestMove : best,
        };
        latest = info;
        finishSearch(info);
      }
    }
  };

  worker.onerror = (err) => {
    console.error("Stockfish worker error", err);
    finishSearch(buildInfo());
  };

  worker.postMessage("uci");
  worker.postMessage("isready");

  return {
    async configureAnalysis(multipv = 2) {
      await waitReady();
      worker.postMessage("setoption name Skill Level value 20");
      worker.postMessage("setoption name UCI_LimitStrength value false");
      worker.postMessage(`setoption name MultiPV value ${multipv}`);
      // WASM builds usually use 1–4 threads well; more Hash helps deeper searches reuse work
      worker.postMessage("setoption name Threads value 4");
      worker.postMessage("setoption name Hash value 192");
      await pingReady();
    },
    async configure(skill: number, elo: number) {
      await waitReady();
      const s = Math.max(0, Math.min(20, skill));
      worker.postMessage(`setoption name Skill Level value ${s}`);
      worker.postMessage("setoption name MultiPV value 1");
      if (s >= 20) {
        worker.postMessage("setoption name UCI_LimitStrength value false");
      } else {
        worker.postMessage("setoption name UCI_LimitStrength value true");
        worker.postMessage(`setoption name UCI_Elo value ${Math.max(800, Math.min(2850, elo))}`);
      }
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
      await waitReady();

      // If a previous search is still running, stop and wait briefly
      if (searching) {
        worker.postMessage("stop");
        await new Promise((r) => setTimeout(r, 50));
      }

      latest = {};
      lines = {};
      onInfo = opts.onUpdate || null;
      searching = true;

      const depth = opts.depth ?? 18;
      // Prefer reaching depth; keep a modest wall-clock so the UI stays snappy
      const movetime =
        opts.movetime ??
        Math.min(3500, Math.max(400, 200 + depth * 45));

      return new Promise((resolve) => {
        resolver = resolve;
        searchTimer = setTimeout(() => {
          worker.postMessage("stop");
          setTimeout(() => {
            if (resolver) finishSearch(buildInfo());
          }, 150);
        }, movetime + 1500);

        worker.postMessage(`position fen ${fen}`);
        worker.postMessage(`go depth ${depth} movetime ${Math.round(movetime)}`);
      });
    },
    async bestMove(
      fen: string,
      opts: { depth?: number; movetime?: number } = {}
    ): Promise<string | undefined> {
      const info = await this.analyze(fen, opts);
      return info.bestMove;
    },
    dispose() {
      if (searchTimer) clearTimeout(searchTimer);
      worker.terminate();
    },
  };
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
  if (mate !== undefined) {
    const mag = 100000 - Math.abs(mate) * 100;
    const signed = mate > 0 ? mag : -mag;
    return turn === "w" ? signed : -signed;
  }
  const cp = scoreCp ?? 0;
  return turn === "w" ? cp : -cp;
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
