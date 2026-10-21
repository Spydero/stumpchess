"use client";

export type EngineInfo = {
  bestMove?: string;
  scoreCp?: number;
  mate?: number;
  depth?: number;
  pv?: string;
};

/**
 * Loads Stockfish from CDN as a Web Worker (runs on the user's device).
 */
export function createStockfish() {
  const worker = new Worker(
    "https://cdn.jsdelivr.net/npm/stockfish.wasm@0.10.0/stockfish.js"
  );

  let resolver: ((info: EngineInfo) => void) | null = null;
  let latest: EngineInfo = {};

  worker.onmessage = (e: MessageEvent<string>) => {
    const line = typeof e.data === "string" ? e.data : String(e.data);
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

  worker.postMessage("uci");
  worker.postMessage("isready");

  return {
    setSkill(level: number) {
      worker.postMessage(`setoption name Skill Level value ${Math.max(0, Math.min(20, level))}`);
    },
    async analyze(fen: string, depth = 12): Promise<EngineInfo> {
      latest = {};
      return new Promise((resolve) => {
        resolver = resolve;
        worker.postMessage("ucinewgame");
        worker.postMessage(`position fen ${fen}`);
        worker.postMessage(`go depth ${depth}`);
      });
    },
    async bestMove(fen: string, depth = 10): Promise<string | undefined> {
      const info = await this.analyze(fen, depth);
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
