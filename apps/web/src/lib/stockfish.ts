"use client";

export type EngineInfo = {
  bestMove?: string;
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
  let ready = false;
  const readyWaiters: Array<() => void> = [];

  const onReady = () => {
    ready = true;
    while (readyWaiters.length) readyWaiters.shift()?.();
  };

  const waitReady = () =>
    new Promise<void>((resolve) => {
      if (ready) resolve();
      else readyWaiters.push(resolve);
    });

  worker.onmessage = (e: MessageEvent<string>) => {
    const line = typeof e.data === "string" ? e.data : String(e.data);
    if (line === "uciok" || line === "readyok") {
      onReady();
    }
    if (line.startsWith("info ")) {
      const depth = / depth (\d+)/.exec(line)?.[1];
      const mate = / score mate (-?\d+)/.exec(line)?.[1];
      const cp = / score cp (-?\d+)/.exec(line)?.[1];
      const pv = / pv (.+)/.exec(line)?.[1];
      latest = {
        ...latest,
        depth: depth ? Number(depth) : latest.depth,
        mate: mate !== undefined ? Number(mate) : undefined,
        scoreCp: cp !== undefined ? Number(cp) : mate !== undefined ? undefined : latest.scoreCp,
        pv: pv?.split(" ").slice(0, 6).join(" ") ?? latest.pv,
      };
    }
    if (line.startsWith("bestmove ")) {
      const best = line.split(/\s+/)[1];
      latest = { ...latest, bestMove: best === "(none)" ? undefined : best };
      resolver?.(latest);
      resolver = null;
    }
  };

  worker.onerror = (err) => {
    console.error("Stockfish worker error", err);
    resolver?.({});
    resolver = null;
  };

  worker.postMessage("uci");
  worker.postMessage("isready");

  return {
    async configure(skill: number, elo: number) {
      await waitReady();
      const s = Math.max(0, Math.min(20, skill));
      worker.postMessage(`setoption name Skill Level value ${s}`);
      // Limit strength when available (Stockfish multi-variant / modern builds)
      worker.postMessage("setoption name UCI_LimitStrength value true");
      worker.postMessage(`setoption name UCI_Elo value ${Math.max(800, Math.min(3000, elo))}`);
      worker.postMessage("isready");
      await waitReady();
    },
    setSkill(level: number) {
      worker.postMessage(`setoption name Skill Level value ${Math.max(0, Math.min(20, level))}`);
    },
    async analyze(
      fen: string,
      opts: { depth?: number; movetime?: number } = {}
    ): Promise<EngineInfo> {
      await waitReady();
      latest = {};
      return new Promise((resolve) => {
        resolver = resolve;
        worker.postMessage("stop");
        worker.postMessage("ucinewgame");
        worker.postMessage(`position fen ${fen}`);
        if (opts.movetime) {
          worker.postMessage(`go movetime ${Math.round(opts.movetime)}`);
        } else {
          worker.postMessage(`go depth ${opts.depth ?? 12}`);
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
