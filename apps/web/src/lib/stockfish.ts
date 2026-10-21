"use client";

export type EngineInfo = {
  bestMove?: string;
  scoreCp?: number;
  mate?: number;
  depth?: number;
  pv?: string;
  /** Second-best line eval (white POV after converting) — raw side-to-move perspective */
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

/**
 * Stockfish Web Worker from same origin (public/engines/stockfish.js).
 */
export function createStockfish() {
  const worker = new Worker("/engines/stockfish.js");

  let resolver: ((info: EngineInfo) => void) | null = null;
  let latest: EngineInfo = {};
  let lines: Record<number, MultipvLine> = {};
  let ready = false;
  const readyWaiters: Array<() => void> = [];
  let onInfo: ((info: EngineInfo) => void) | null = null;

  const onReady = () => {
    ready = true;
    while (readyWaiters.length) readyWaiters.shift()?.();
  };

  const waitReady = () =>
    new Promise<void>((resolve) => {
      if (ready) resolve();
      else readyWaiters.push(resolve);
    });

  const buildInfo = (): EngineInfo => {
    const primary = lines[1] || {};
    const second = lines[2];
    const pvFirst = primary.pv?.split(" ")[0];
    return {
      bestMove: latest.bestMove || pvFirst,
      scoreCp: primary.scoreCp,
      mate: primary.mate,
      depth: primary.depth ?? latest.depth,
      pv: primary.pv,
      secondScoreCp: second?.scoreCp,
      secondMate: second?.mate,
      secondBestMove: second?.pv?.split(" ")[0],
    };
  };

  worker.onmessage = (e: MessageEvent<string>) => {
    const line = typeof e.data === "string" ? e.data : String(e.data);
    if (line === "uciok" || line === "readyok") {
      onReady();
    }
    if (line.startsWith("info ") && line.includes(" score ")) {
      const multipv = Number(/ multipv (\d+)/.exec(line)?.[1] || "1");
      const depth = / depth (\d+)/.exec(line)?.[1];
      const mate = / score mate (-?\d+)/.exec(line)?.[1];
      const cp = / score cp (-?\d+)/.exec(line)?.[1];
      const pv = / pv (.+)/.exec(line)?.[1];
      lines[multipv] = {
        multipv,
        depth: depth ? Number(depth) : lines[multipv]?.depth,
        mate: mate !== undefined ? Number(mate) : undefined,
        scoreCp: cp !== undefined ? Number(cp) : mate !== undefined ? undefined : lines[multipv]?.scoreCp,
        pv: pv ?? lines[multipv]?.pv,
      };
      latest = {
        ...latest,
        ...buildInfo(),
        depth: depth ? Number(depth) : latest.depth,
      };
      onInfo?.(buildInfo());
    }
    if (line.startsWith("bestmove ")) {
      const best = line.split(/\s+/)[1];
      latest = { ...buildInfo(), bestMove: best === "(none)" ? undefined : best };
      resolver?.(latest);
      resolver = null;
      onInfo = null;
    }
  };

  worker.onerror = (err) => {
    console.error("Stockfish worker error", err);
    resolver?.({});
    resolver = null;
    onInfo = null;
  };

  worker.postMessage("uci");
  worker.postMessage("isready");

  return {
    /** Full strength for premium analysis */
    async configureAnalysis() {
      await waitReady();
      worker.postMessage("setoption name Skill Level value 20");
      worker.postMessage("setoption name UCI_LimitStrength value false");
      worker.postMessage("setoption name MultiPV value 2");
      worker.postMessage("setoption name Threads value 1");
      worker.postMessage("isready");
      await waitReady();
    },
    /** Strength-limited play for bots */
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
      worker.postMessage("isready");
      await waitReady();
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
      latest = {};
      lines = {};
      onInfo = opts.onUpdate || null;
      return new Promise((resolve) => {
        resolver = resolve;
        worker.postMessage("stop");
        worker.postMessage(`position fen ${fen}`);
        if (opts.movetime) {
          worker.postMessage(`go movetime ${Math.round(opts.movetime)}`);
        } else {
          worker.postMessage(`go depth ${opts.depth ?? 18}`);
        }
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

/** Convert engine score (side-to-move POV) to white POV centipawns. */
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
    const mates = whiteCp > 0 ? Math.ceil((100000 - whiteCp) / 100) : -Math.ceil((100000 + whiteCp) / 100);
    return mates === 0 ? (whiteCp > 0 ? "M1" : "-M1") : whiteCp > 0 ? `M${Math.abs(mates)}` : `-M${Math.abs(mates)}`;
  }
  const p = whiteCp / 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(2)}`;
}
