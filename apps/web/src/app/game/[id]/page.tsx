"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { GameBoard } from "@/components/GameBoard";

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
  const user = data?.user as { id: string } | undefined;
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/api/games/${params.id}`)
      .then(setGame)
      .catch((e) => setError(e.message));
  }, [params.id]);

  if (isPending || !game) {
    return <p className="pulse-soft">{error || "Loading game…"}</p>;
  }
  if (!user) {
    router.push("/login");
    return null;
  }

  const isBot = game.isBot || search.get("bot") === "1";

  return (
    <div>
      <h1 className="text-2xl mb-4 font-[family-name:var(--font-mono)]">Game</h1>
      <GameBoard
        gameId={game.id}
        userId={user.id}
        initialFen={game.fen}
        whiteId={game.whiteId}
        blackId={game.blackId}
        whiteName={game.white?.username || (isBot ? "You" : "White")}
        blackName={game.black?.username || (isBot ? `Bot lv${game.botLevel ?? 5}` : "Black")}
        initialMs={game.initialMs}
        isBot={isBot}
        botLevel={game.botLevel ?? 5}
        status={game.status}
        result={game.result}
      />
    </div>
  );
}
