"use client";

import { formatEval } from "@/lib/stockfish";

/** Vertical eval bar: 0 = black winning hard, 1 = white winning hard */
export function EvalBar({ whiteCp }: { whiteCp: number }) {
  const clamped = Math.max(-1000, Math.min(1000, whiteCp));
  // sigmoid-ish for display
  const t = 1 / (1 + Math.exp(-clamped / 280));
  const whitePct = Math.round(t * 100);

  return (
    <div className="flex flex-col items-center gap-1 w-8 sm:w-9 shrink-0">
      <span className="ui text-[10px] font-semibold tabular-nums">{formatEval(whiteCp)}</span>
      <div className="relative w-full flex-1 min-h-[220px] sm:min-h-[320px] rounded-sm overflow-hidden border border-[var(--line)]">
        <div className="absolute inset-0 bg-[#40352b]" />
        <div
          className="absolute bottom-0 left-0 right-0 bg-[#e8d9c0] transition-[height] duration-300"
          style={{ height: `${whitePct}%` }}
        />
      </div>
    </div>
  );
}
