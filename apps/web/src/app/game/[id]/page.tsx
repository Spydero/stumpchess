"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  PERSONALITY_BOTS,
  STOCKFISH_BOT,
  botPresetBySkill,
  decodeBotLevel,
  formatEngineElo,
  isEngineFullStrength,
} from "@chess/shared";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { GameBoard } from "@/components/GameBoard";
import { useVipFeatures } from "@/lib/vip-features";

type Game = {
  id: string;
  fen: string;
  status: string;
  result: string | null;
  initialMs: number;
  isBot: boolean;
  botLevel: number | null;
  whiteId: string | null;
  blackId: string | null;
  white: { id: string; username: string } | null;
  black: { id: string; username: string } | null;
};

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { data, isPending } = useSession();
  const user = data?.user as {
    id: string;
    role?: string;
    vipExpiresAt?: string | null;
  } | undefined;
  const vip = useVipFeatures(user);
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);

  function load() {
    apiFetch(`/api/games/${params.id}`)
      .then(setGame)
      .catch((e) => setError(e.message));
  }

  useEffect(load, [params.id]);

  async function accept() {
    if (!user) return router.push("/login");
    setAccepting(true);
    try {
      await apiFetch(`/api/games/${params.id}/accept`, {
        method: "POST",
        userId: user.id,
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setAccepting(false);
    }
  }

  if (isPending || !game) {
    return <p className="pulse-soft ui muted">{error || "Loading…"}</p>;
  }
  if (!user) {
    router.push("/login");
    return null;
  }

  const isBot = game.isBot || search.get("bot") === "1";
  const isParticipant = user.id === game.whiteId || user.id === game.blackId;
  const decoded = decodeBotLevel(game.botLevel ?? 5);
  const bot = botPresetBySkill(decoded.skill);
  const named =
    decoded.kind === "engine"
      ? STOCKFISH_BOT
      : PERSONALITY_BOTS.find((b) => b.skill === decoded.skill);
  const botLabel = named
    ? named.name
    : `Bot ${decoded.kind === "engine" ? formatEngineElo(decoded.elo) : decoded.elo}`;

  if (game.status === "WAITING") {
    return (
      <div className="panel p-5 max-w-lg">
        <h1 className="text-2xl mb-2">Challenge</h1>
        <p className="ui muted mb-4">
          {game.white?.username || "White"} vs {game.black?.username || "Black"} (
          {game.initialMs / 60000}+0)
        </p>
        {isParticipant ? (
          <button type="button" className="btn btn-accent" onClick={accept} disabled={accepting}>
            {accepting ? "…" : "Accept and start"}
          </button>
        ) : (
          <p className="ui text-sm muted">Waiting for players to accept.</p>
        )}
        {error && <p className="text-[var(--danger)] ui text-sm mt-3">{error}</p>}
      </div>
    );
  }

  const whiteName =
    game.white?.username ||
    (isBot && game.whiteId === user.id ? "You" : isBot && !game.whiteId ? botLabel : "White");
  const blackName =
    game.black?.username ||
    (isBot && game.blackId === user.id ? "You" : isBot && !game.blackId ? botLabel : "Black");

  const isSpectator = !isParticipant && !isBot;

  return (
    <div>
      <h1 className="text-xl sm:text-2xl mb-1 ui font-semibold">
        {whiteName} vs {blackName}
        {isSpectator && game.status === "ACTIVE" ? (
          <span className="ui text-sm font-normal muted ml-2">· Spectating</span>
        ) : null}
      </h1>
      {isSpectator && game.status === "ACTIVE" && (
        <p className="ui text-xs muted mb-3">
          Live watch mode. Engine analysis stays off until the game ends.
        </p>
      )}
      {isBot && (
        <p className="ui text-sm muted mb-4">
          {named ? (
            <>
              {named.name}
              {" · "}
              {decoded.kind === "engine"
                ? isEngineFullStrength(decoded.elo)
                  ? "Max"
                  : `~${formatEngineElo(decoded.elo)} Elo`
                : "style" in named
                  ? `~${decoded.elo} Elo · ${named.style}`
                  : `~${decoded.elo} Elo`}
              <span className="block text-xs mt-0.5">{named.tagline}</span>
            </>
          ) : (
            <>
              {decoded.elo} Elo · {bot.label}
            </>
          )}
        </p>
      )}
      <GameBoard
        gameId={game.id}
        userId={user.id}
        canAnalyze={vip.allowed}
        initialFen={game.fen}
        whiteId={game.whiteId}
        blackId={game.blackId}
        whiteName={whiteName}
        blackName={blackName}
        initialMs={game.initialMs}
        isBot={isBot}
        botLevel={game.botLevel ?? decoded.skill}
        status={game.status}
        result={game.result}
      />
    </div>
  );
}
