import type { Square } from "chess.js";

/** Format ms as M:SS (ceil seconds). */
export function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Soft click via Web Audio (no asset files). */
export function playMoveSound(kind: "move" | "capture" | "check" | "gameend" = "move") {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    if (kind === "capture") {
      o.frequency.value = 180;
      g.gain.setValueAtTime(0.08, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      o.start(now);
      o.stop(now + 0.12);
    } else if (kind === "check") {
      o.frequency.value = 520;
      g.gain.setValueAtTime(0.06, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      o.start(now);
      o.stop(now + 0.18);
    } else if (kind === "gameend") {
      o.type = "triangle";
      o.frequency.value = 330;
      g.gain.setValueAtTime(0.07, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      o.start(now);
      o.stop(now + 0.35);
    } else {
      o.frequency.value = 420;
      g.gain.setValueAtTime(0.05, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      o.start(now);
      o.stop(now + 0.08);
    }
    void ctx.resume();
    setTimeout(() => void ctx.close(), 500);
  } catch {
    /* ignore */
  }
}

export function needsPromotion(
  chess: { get: (sq: Square) => { type: string; color: string } | undefined },
  from: string,
  to: string
) {
  const piece = chess.get(from as Square);
  if (!piece || piece.type !== "p") return false;
  const rank = to[1];
  return (piece.color === "w" && rank === "8") || (piece.color === "b" && rank === "1");
}
