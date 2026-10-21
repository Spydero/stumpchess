"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { createStockfish, type EngineInfo } from "@/lib/stockfish";
import { userHasVip } from "@/lib/roles";
import Link from "next/link";

type ClassLabel =
  | "Brilliant"
  | "Best"
  | "Great"
  | "Good"
  | "Book"
  | "Inaccuracy"
  | "Mistake"
  | "Blunder"
  | "Miss";

type AnalyzedMove = {
  san: string;
  fenBefore: string;
  fenAfter: string;
  classification: ClassLabel;
  bestMove?: string;
  cpl: number;
  evalAfter: number;
};

function classifyCpl(cpl: number, isBest: boolean): ClassLabel {
  if (isBest) return "Best";
  if (cpl <= 15) return "Good";
  if (cpl <= 40) return "Inaccuracy";
  if (cpl <= 90) return "Mistake";
  return "Blunder";
}

const LABEL_COLOR: Record<ClassLabel, string> = {
  Brilliant: "#1baca6",
  Best: "#96bc4b",
  Great: "#96bc4b",
  Good: "#96bc4b",
  Book: "#a88865",
  Inaccuracy: "#f7c631",
  Mistake: "#e6912c",
  Blunder: "#ca3431",
  Miss: "#e6912c",
};

export default function AnalysisPage() {
  const { data, isPending } = useSession();
  const user = data?.user as { id: string; role?: string; vipExpiresAt?: string | null } | undefined;
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [pgn, setPgn] = useState("");
  const [moves, setMoves] = useState<AnalyzedMove[]>([]);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const engineRef = useRef<ReturnType<typeof createStockfish> | null>(null);

  useEffect(() => {
    if (!user) {
      setAllowed(false);
      return;
    }
    if (userHasVip(user.role || "MEMBER", user.vipExpiresAt)) {
      setAllowed(true);
      return;
    }
    apiFetch("/api/games/analyze/check", { method: "POST", userId: user.id })
      .then(() => setAllowed(true))
      .catch(() => setAllowed(false));
  }, [user]);

  useEffect(() => () => engineRef.current?.dispose(), []);

  async function runAnalysis() {
    setBusy(true);
    setMoves([]);
    setProgress("Loading engine on your device…");
    try {
      if (!engineRef.current) engineRef.current = createStockfish();
      const chess = new Chess();
      chess.loadPgn(pgn);
      const history = chess.history({ verbose: true });
      chess.reset();

      const analyzed: AnalyzedMove[] = [];
      let prevEval = 0;

      for (let i = 0; i < history.length; i++) {
        setProgress(`Analyzing move ${i + 1}/${history.length} (your CPU)…`);
        const fenBefore = chess.fen();
        const infoBefore: EngineInfo = await engineRef.current.analyze(fenBefore, 12);
        const bestUci = infoBefore.bestMove;
        const evalBefore =
          infoBefore.mate !== undefined
            ? infoBefore.mate > 0
              ? 10000
              : -10000
            : (infoBefore.scoreCp ?? 0);

        // side to move perspective → flip to white perspective
        const whiteEvalBefore = chess.turn() === "w" ? evalBefore : -evalBefore;

        const mv = history[i];
        chess.move(mv);
        const fenAfter = chess.fen();
        const infoAfter = await engineRef.current.analyze(fenAfter, 10);
        const evalAfterRaw =
          infoAfter.mate !== undefined
            ? infoAfter.mate > 0
              ? 10000
              : -10000
            : (infoAfter.scoreCp ?? 0);
        const whiteEvalAfter = chess.turn() === "w" ? evalAfterRaw : -evalAfterRaw;

        const playedUci = `${mv.from}${mv.to}${mv.promotion || ""}`;
        const isBest = !!bestUci && playedUci === bestUci;
        const loss =
          mv.color === "w"
            ? Math.max(0, whiteEvalBefore - whiteEvalAfter)
            : Math.max(0, whiteEvalAfter - whiteEvalBefore);

        let classification: ClassLabel = classifyCpl(loss, isBest);
        if (isBest && loss === 0 && Math.abs(whiteEvalAfter - prevEval) > 150) {
          classification = "Brilliant";
        }

        analyzed.push({
          san: mv.san,
          fenBefore,
          fenAfter,
          classification,
          bestMove: bestUci,
          cpl: Math.round(loss),
          evalAfter: whiteEvalAfter,
        });
        prevEval = whiteEvalAfter;
      }

      setMoves(analyzed);
      setIdx(0);
      setProgress("Done.");
    } catch (e) {
      setProgress(e instanceof Error ? e.message : "Failed to analyze PGN");
    } finally {
      setBusy(false);
    }
  }

  const position = useMemo(() => {
    if (!moves.length) return "start";
    return moves[Math.min(idx, moves.length - 1)]?.fenAfter || "start";
  }, [moves, idx]);

  if (isPending) return <p className="pulse-soft ui muted">Loading…</p>;
  if (!user) {
    return (
      <div className="panel p-5">
        <p className="ui">
          <Link href="/login" className="link-accent">
            Login
          </Link>{" "}
          to use analysis.
        </p>
      </div>
    );
  }
  if (allowed === false) {
    return (
      <div className="panel p-6 max-w-lg">
        <h1 className="text-3xl mb-3">Analysis</h1>
        <p className="muted ui">
          Full game analysis is available for VIP members. Ask a site admin to enable it on your
          account.
        </p>
      </div>
    );
  }
  if (allowed === null) return <p className="pulse-soft ui muted">Loading…</p>;

  const current = moves[idx];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <section>
        <h1 className="text-3xl mb-4">Analysis</h1>
        <div className="max-w-[min(100%,480px)]">
          <Chessboard
            position={position}
            arePiecesDraggable={false}
            customDarkSquareStyle={{ backgroundColor: "var(--board-dark)" }}
            customLightSquareStyle={{ backgroundColor: "var(--board-light)" }}
          />
        </div>
        {current && (
          <p className="mt-3 ui text-sm">
            <span style={{ color: LABEL_COLOR[current.classification] }} className="font-semibold">
              {current.classification}
            </span>
            <span className="muted">
              {" "}
              {current.san} ({current.cpl} cpl)
              {current.bestMove ? ` best ${current.bestMove}` : ""}
            </span>
          </p>
        )}
        {moves.length > 0 && (
          <div className="flex gap-2 mt-3">
            <button type="button" className="btn btn-ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))}>
              Prev
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIdx((i) => Math.min(moves.length - 1, i + 1))}
            >
              Next
            </button>
          </div>
        )}
      </section>

      <aside className="panel p-4 h-fit space-y-3">
        <textarea
          className="input min-h-40 ui text-xs"
          placeholder="Paste PGN"
          value={pgn}
          onChange={(e) => setPgn(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-accent w-full"
          disabled={busy || !pgn.trim()}
          onClick={runAnalysis}
        >
          {busy ? "Analyzing…" : "Analyze"}
        </button>
        {progress && <p className="ui text-xs muted">{progress}</p>}
        <div className="flex flex-wrap gap-1 max-h-64 overflow-auto">
          {moves.map((m, i) => (
            <button
              key={`${m.san}-${i}`}
              type="button"
              className="badge"
              style={{
                color: LABEL_COLOR[m.classification],
                opacity: i === idx ? 1 : 0.7,
                borderWidth: i === idx ? 2 : 1,
              }}
              onClick={() => setIdx(i)}
            >
              {i + 1}.{m.san}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
