"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  botEloFromSkill,
  botPresetBySkill,
  decodeBotLevel,
  engineThinkMs,
  formatEngineElo,
  hasVipAccess,
  isEngineFullStrength,
  personalityThinkMs,
  type Role,
} from "@chess/shared";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { createStockfish, uciToMove } from "@/lib/stockfish";

type Props = {
  gameId: string;
  userId: string;
  userRole?: string;
  vipExpiresAt?: string | Date | null;
  initialFen: string;
  whiteId: string | null;
  blackId: string | null;
  whiteName: string;
  blackName: string;
  initialMs: number;
  isBot?: boolean;
  botLevel?: number;
  status: string;
  result?: string | null;
};

export function GameBoard(props: Props) {
  const [fen, setFen] = useState(props.initialFen);
  const [status, setStatus] = useState(props.status);
  const [result, setResult] = useState(props.result ?? null);
  const [transport, setTransport] = useState<"webrtc" | "relay" | "local">("relay");
  const [thinking, setThinking] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const chessRef = useRef(new Chess(props.initialFen));
  const engineRef = useRef<ReturnType<typeof createStockfish> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const whiteTime = useRef(props.initialMs);
  const blackTime = useRef(props.initialMs);
  const [clocks, setClocks] = useState({ w: props.initialMs, b: props.initialMs });
  const botBusy = useRef(false);

  const decoded = decodeBotLevel(props.botLevel ?? 5);
  const skill = decoded.skill;
  const botMeta = botPresetBySkill(skill);
  const botElo = decoded.kind === "engine" ? decoded.elo : botEloFromSkill(skill);
  const engineMode = decoded.kind === "engine";

  const myColor: "w" | "b" | null =
    props.userId === props.whiteId ? "w" : props.userId === props.blackId ? "b" : null;

  const opponentId =
    myColor === "w" ? props.blackId : myColor === "b" ? props.whiteId : null;

  const orientation = myColor === "b" ? "black" : "white";

  const canAnalyze = hasVipAccess((props.userRole as Role) || "MEMBER", props.vipExpiresAt);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setOptionSquares({});
  }, []);

  const showLegalMoves = useCallback((square: Square) => {
    const moves = chessRef.current.moves({ square, verbose: true });
    const styles: Record<string, React.CSSProperties> = {
      [square]: { background: "rgba(61, 107, 79, 0.45)" },
    };
    for (const m of moves) {
      styles[m.to] = {
        background:
          m.captured
            ? "radial-gradient(circle, rgba(0,0,0,.15) 55%, rgba(61,107,79,.55) 56%)"
            : "radial-gradient(circle, rgba(61,107,79,.45) 22%, transparent 23%)",
      };
    }
    setOptionSquares(styles);
  }, []);

  const sendMove = useCallback(
    (payload: Record<string, unknown>) => {
      if (dcRef.current?.readyState === "open") {
        dcRef.current.send(JSON.stringify({ type: "move", ...payload }));
        setTransport("webrtc");
      } else if (!props.isBot) {
        getSocket().emit("game:move", payload);
        setTransport("relay");
      }
    },
    [props.isBot]
  );

  const runBotMove = useCallback(async () => {
    if (!props.isBot || botBusy.current) return;
    const chess = chessRef.current;
    if (chess.isGameOver() || status !== "ACTIVE") return;
    if (myColor && chess.turn() === myColor) return;

    botBusy.current = true;
    setThinking(true);
    const started = Date.now();
    const { movetime, minDelay } = engineMode
      ? engineThinkMs({ initialMs: props.initialMs, elo: decoded.elo })
      : personalityThinkMs({ skill, initialMs: props.initialMs });

    try {
      if (!engineRef.current) {
        engineRef.current = createStockfish();
      }
      if (engineMode) {
        await engineRef.current.configureEngine(decoded.elo);
      } else {
        await engineRef.current.configure(skill, botElo, { multipv: 1 });
      }
      const best = await engineRef.current.bestMove(chess.fen(), { movetime });
      const elapsed = Date.now() - started;
      if (elapsed < minDelay) {
        await new Promise((r) => setTimeout(r, minDelay - elapsed));
      }
      const m = best ? uciToMove(best) : null;
      if (m) {
        // apply as remote so we don't recurse into another bot call from applyMove's human path
        const move = chess.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
        if (move) {
          setFen(chess.fen());
          clearSelection();
          if (chess.isGameOver()) {
            let res = "1/2-1/2";
            if (chess.isCheckmate()) res = chess.turn() === "b" ? "1-0" : "0-1";
            setStatus("FINISHED");
            setResult(res);
            await apiFetch(`/api/games/${props.gameId}/result`, {
              method: "POST",
              userId: props.userId,
              body: JSON.stringify({ pgn: chess.pgn(), result: res, fen: chess.fen() }),
            }).catch(() => null);
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setThinking(false);
      botBusy.current = false;
    }
  }, [
    props.isBot,
    props.initialMs,
    props.gameId,
    props.userId,
    skill,
    botElo,
    engineMode,
    decoded.elo,
    myColor,
    status,
    clearSelection,
  ]);

  const applyMove = useCallback(
    async (from: string, to: string, promotion?: string, remote = false) => {
      const chess = chessRef.current;
      if (status !== "ACTIVE") return false;
      try {
        const move = chess.move({ from, to, promotion: promotion || "q" });
        if (!move) return false;
        setFen(chess.fen());
        clearSelection();

        const payload = {
          gameId: props.gameId,
          from,
          to,
          promotion: move.promotion,
          san: move.san,
          fen: chess.fen(),
          whiteTimeMs: whiteTime.current,
          blackTimeMs: blackTime.current,
          movedAt: Date.now(),
        };

        if (!remote && !props.isBot) sendMove(payload);

        if (chess.isGameOver()) {
          let res = "1/2-1/2";
          if (chess.isCheckmate()) res = chess.turn() === "b" ? "1-0" : "0-1";
          setStatus("FINISHED");
          setResult(res);
          await apiFetch(`/api/games/${props.gameId}/result`, {
            method: "POST",
            userId: props.userId,
            body: JSON.stringify({ pgn: chess.pgn(), result: res, fen: chess.fen() }),
          }).catch(() => null);
        } else if (props.isBot && !remote && chess.turn() !== myColor) {
          void runBotMove();
        }
        return true;
      } catch {
        return false;
      }
    },
    [status, props, sendMove, myColor, clearSelection, runBotMove]
  );

  useEffect(() => {
    const s = getSocket();
    s.connect();
    s.emit("auth", { userId: props.userId, username: props.userId });
    s.emit("game:join", { gameId: props.gameId });

    const onMove = (payload: { from: string; to: string; promotion?: string; fen: string }) => {
      if (payload.fen === chessRef.current.fen()) return;
      applyMove(payload.from, payload.to, payload.promotion, true);
    };
    const onEnded = (payload: { result: string }) => {
      setStatus("FINISHED");
      setResult(payload.result);
    };

    s.on("game:move", onMove);
    s.on("game:ended", onEnded);

    if (!props.isBot && opponentId && myColor) {
      const polite = myColor === "w";
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          s.emit("webrtc:signal", {
            gameId: props.gameId,
            toUserId: opponentId,
            data: { type: "ice", candidate: ev.candidate },
          });
        }
      };

      pc.ondatachannel = (ev) => {
        dcRef.current = ev.channel;
        ev.channel.onmessage = (msg) => {
          try {
            const data = JSON.parse(String(msg.data));
            if (data.type === "move") applyMove(data.from, data.to, data.promotion, true);
          } catch {
            /* ignore */
          }
        };
        setTransport("webrtc");
      };

      if (!polite) {
        const dc = pc.createDataChannel("moves");
        dcRef.current = dc;
        dc.onopen = () => setTransport("webrtc");
        dc.onmessage = (msg) => {
          try {
            const data = JSON.parse(String(msg.data));
            if (data.type === "move") applyMove(data.from, data.to, data.promotion, true);
          } catch {
            /* ignore */
          }
        };
        pc.createOffer().then(async (offer) => {
          await pc.setLocalDescription(offer);
          s.emit("webrtc:signal", {
            gameId: props.gameId,
            toUserId: opponentId,
            data: { type: "offer", sdp: offer },
          });
        });
      }

      const onSignal = async (payload: {
        fromUserId: string;
        data: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
      }) => {
        if (payload.fromUserId !== opponentId) return;
        const data = payload.data;
        if (data.type === "offer" && data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          s.emit("webrtc:signal", {
            gameId: props.gameId,
            toUserId: opponentId,
            data: { type: "answer", sdp: answer },
          });
        } else if (data.type === "answer" && data.sdp) {
          await pc.setRemoteDescription(data.sdp);
        } else if (data.type === "ice" && data.candidate) {
          try {
            await pc.addIceCandidate(data.candidate);
          } catch {
            /* ignore */
          }
        }
      };
      s.on("webrtc:signal", onSignal);

      return () => {
        s.off("game:move", onMove);
        s.off("game:ended", onEnded);
        s.off("webrtc:signal", onSignal);
        pc.close();
        engineRef.current?.dispose();
      };
    }

    if (props.isBot) {
      setTransport("local");
      (async () => {
        try {
          engineRef.current = createStockfish();
          await engineRef.current.configure(skill, botElo);
          if (myColor === "b" && chessRef.current.turn() === "w" && status === "ACTIVE") {
            void runBotMove();
          }
        } catch (e) {
          console.error("Failed to start engine", e);
        }
      })();
    }

    return () => {
      s.off("game:move", onMove);
      s.off("game:ended", onEnded);
      engineRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.gameId, props.userId, props.isBot, skill]);

  useEffect(() => {
    if (status !== "ACTIVE") return;
    const id = setInterval(() => {
      const turn = chessRef.current.turn();
      if (turn === "w") whiteTime.current = Math.max(0, whiteTime.current - 250);
      else blackTime.current = Math.max(0, blackTime.current - 250);
      setClocks({ w: whiteTime.current, b: blackTime.current });
    }, 250);
    return () => clearInterval(id);
  }, [status, fen]);

  function onDrop(source: string, target: string) {
    if (!myColor || chessRef.current.turn() !== myColor || status !== "ACTIVE" || thinking) {
      return false;
    }
    void applyMove(source, target);
    return true;
  }

  function onSquareClick(square: Square) {
    if (!myColor || chessRef.current.turn() !== myColor || status !== "ACTIVE" || thinking) {
      return;
    }
    const piece = chessRef.current.get(square as Square);

    if (selected) {
      if (selected === square) {
        clearSelection();
        return;
      }
      const legal = chessRef.current
        .moves({ square: selected, verbose: true })
        .some((m) => m.to === square);
      if (legal) {
        void applyMove(selected, square);
        return;
      }
      if (piece && piece.color === myColor) {
        setSelected(square);
        showLegalMoves(square);
        return;
      }
      clearSelection();
      return;
    }

    if (piece && piece.color === myColor) {
      setSelected(square);
      showLegalMoves(square);
    }
  }

  async function resign() {
    if (!myColor || status !== "ACTIVE") return;
    getSocket().emit("game:resign", { gameId: props.gameId });
    const res = myColor === "w" ? "0-1" : "1-0";
    setStatus("FINISHED");
    setResult(res);
    await apiFetch(`/api/games/${props.gameId}/result`, {
      method: "POST",
      userId: props.userId,
      body: JSON.stringify({ pgn: chessRef.current.pgn(), result: res, fen: chessRef.current.fen() }),
    }).catch(() => null);
  }

  function openAnalysis() {
    let pgn = chessRef.current.pgn();
    // Ensure move text exists even if headers-only somehow
    if (!chessRef.current.history().length) {
      return;
    }
    if (!/\d+\./.test(pgn)) {
      pgn = chessRef.current.history().reduce((acc, san, i) => {
        if (i % 2 === 0) acc += `${Math.floor(i / 2) + 1}. ${san} `;
        else acc += `${san} `;
        return acc;
      }, "").trim();
    }
    try {
      sessionStorage.setItem("stumpchess-analyze-pgn", pgn);
    } catch {
      /* ignore */
    }
  }

  const fmt = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  const customSquares = useMemo(() => optionSquares, [optionSquares, fen]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,min(100%,520px))_minmax(200px,1fr)]">
      <div className="w-full max-w-[520px]">
        <Chessboard
          position={fen}
          onPieceDrop={onDrop}
          onSquareClick={onSquareClick}
          boardOrientation={orientation}
          customBoardStyle={{ borderRadius: 2, boxShadow: "var(--shadow)" }}
          customDarkSquareStyle={{ backgroundColor: "var(--board-dark)" }}
          customLightSquareStyle={{ backgroundColor: "var(--board-light)" }}
          customSquareStyles={customSquares}
          arePiecesDraggable={status === "ACTIVE" && !!myColor && !thinking}
        />
      </div>
      <aside className="panel p-4 sm:p-5 h-fit">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="ui text-xs uppercase muted m-0">Black</p>
            <p className="text-lg sm:text-xl m-0 mt-0.5">{props.blackName}</p>
          </div>
          <p className="ui text-xl sm:text-2xl font-semibold m-0 tabular-nums">{fmt(clocks.b)}</p>
        </div>
        <div className="flex justify-between items-start mb-5 border-t border-[var(--line)] pt-4">
          <div>
            <p className="ui text-xs uppercase muted m-0">White</p>
            <p className="text-lg sm:text-xl m-0 mt-0.5">{props.whiteName}</p>
          </div>
          <p className="ui text-xl sm:text-2xl font-semibold m-0 tabular-nums">{fmt(clocks.w)}</p>
        </div>

        {props.isBot && (
          <p className="ui text-sm muted mb-2">
            {engineMode
              ? `Stockfish · ${isEngineFullStrength(decoded.elo) ? "Max" : `${formatEngineElo(decoded.elo)} Elo`}`
              : `Computer · ${botElo} Elo (${botMeta.label})`}
            {thinking ? " · thinking…" : ""}
          </p>
        )}
        {!props.isBot && transport === "webrtc" && (
          <p className="ui text-sm muted mb-2">Direct connection</p>
        )}

        {status === "FINISHED" && (
          <div className="mb-4 space-y-3">
            <p className="text-lg ui m-0">Result: {result}</p>
            {canAnalyze ? (
              <Link
                href="/analysis"
                className="btn btn-accent inline-flex"
                onClick={openAnalysis}
              >
                Analyze game
              </Link>
            ) : (
              <p className="ui text-xs muted m-0">Analysis is available for VIP accounts.</p>
            )}
          </div>
        )}

        {status === "ACTIVE" && myColor && (
          <button type="button" className="btn btn-ghost" onClick={resign} disabled={thinking}>
            Resign
          </button>
        )}
      </aside>
    </div>
  );
}
