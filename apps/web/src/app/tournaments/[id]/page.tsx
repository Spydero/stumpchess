"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { RoleBadge } from "@/components/RoleBadge";

type Player = {
  userId: string;
  score: number;
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  user: { id: string; username: string; role: string };
};

type GameRow = {
  id: string;
  status: string;
  result: string | null;
  tournamentRound: number | null;
  white: { id: string; username: string } | null;
  black: { id: string; username: string } | null;
};

type Tourney = {
  id: string;
  name: string;
  description: string;
  status: string;
  timeControl: string;
  maxRounds: number;
  currentRound: number;
  maxPlayers: number;
  hostId: string;
  host: { id: string; username: string; role: string };
  players: Player[];
  games: GameRow[];
};

export default function TournamentDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isPending } = useSession();
  const user = data?.user as { id: string } | undefined;
  const router = useRouter();
  const [t, setT] = useState<Tourney | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  function load() {
    apiFetch(`/api/tournaments/${params.id}`)
      .then(setT)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [params.id]);

  async function act(path: string, label: string) {
    if (!user) return router.push("/login");
    setBusy(label);
    setError("");
    try {
      await apiFetch(`/api/tournaments/${params.id}/${path}`, {
        method: "POST",
        userId: user.id,
        body: "{}",
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  }

  if (isPending || !t) {
    return <p className="pulse-soft ui muted">{error || "Loading…"}</p>;
  }

  const isHost = user?.id === t.hostId;
  const joined = !!user && t.players.some((p) => p.userId === user.id);
  const roundGames = t.games.filter((g) => g.tournamentRound === t.currentRound);
  const openThisRound = roundGames.filter((g) => g.status !== "FINISHED").length;

  return (
    <div className="rise-in">
      <div className="mb-4">
        <Link href="/tournaments" className="ui text-sm link-accent">
          All tournaments
        </Link>
      </div>

      <header className="page-hero mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="forum-kicker">{t.status}</p>
            <h1 className="text-3xl sm:text-4xl mt-1 mb-1">{t.name}</h1>
            <p className="muted ui text-sm m-0">
              Host {t.host.username} · {t.timeControl} · Round {t.currentRound}/{t.maxRounds} ·{" "}
              {t.players.length}/{t.maxPlayers} players
            </p>
            {t.description && <p className="ui text-sm mt-2 mb-0">{t.description}</p>}
          </div>
          <span className={`tourney-status tourney-status--${t.status.toLowerCase()}`}>
            {t.status}
          </span>
        </div>
      </header>

      {error && <p className="text-[var(--danger)] ui text-sm mb-3">{error}</p>}

      <div className="flex flex-wrap gap-2 mb-5">
        {t.status === "OPEN" && user && !joined && (
          <button
            type="button"
            className="btn btn-accent"
            disabled={!!busy}
            onClick={() => act("join", "join")}
          >
            {busy === "join" ? "…" : "Join"}
          </button>
        )}
        {t.status === "OPEN" && joined && !isHost && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!!busy}
            onClick={() => act("leave", "leave")}
          >
            {busy === "leave" ? "…" : "Leave"}
          </button>
        )}
        {isHost && t.status === "OPEN" && (
          <button
            type="button"
            className="btn btn-accent"
            disabled={!!busy || t.players.length < 2}
            onClick={() => act("start", "start")}
          >
            {busy === "start" ? "…" : "Start round 1"}
          </button>
        )}
        {isHost && t.status === "RUNNING" && t.currentRound < t.maxRounds && (
          <button
            type="button"
            className="btn btn-accent"
            disabled={!!busy || openThisRound > 0}
            onClick={() => act("next-round", "next")}
            title={openThisRound > 0 ? "Finish all games this round first" : undefined}
          >
            {busy === "next" ? "…" : `Start round ${t.currentRound + 1}`}
          </button>
        )}
        {isHost && t.status === "RUNNING" && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!!busy || t.games.some((g) => g.status !== "FINISHED")}
            onClick={() => act("finish", "finish")}
          >
            {busy === "finish" ? "…" : "Finish tournament"}
          </button>
        )}
        {isHost && (t.status === "OPEN" || t.status === "RUNNING") && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!!busy}
            onClick={() => act("cancel", "cancel")}
          >
            {busy === "cancel" ? "…" : "Cancel"}
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)]">
            <h2 className="text-lg m-0">Standings</h2>
          </div>
          {t.players.map((p, i) => (
            <div key={p.userId} className="table-row ui text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className="muted w-5">{i + 1}</span>
                <Link href={`/u/${p.user.username}`} className="font-semibold truncate">
                  {p.user.username}
                </Link>
                {p.user.role !== "MEMBER" && <RoleBadge role={p.user.role} />}
              </span>
              <span className="muted shrink-0 tabular-nums">
                {p.score} pts
                <span className="text-xs ml-2">
                  {p.wins}W {p.draws}D {p.losses}L
                  {p.byes ? ` ${p.byes}bye` : ""}
                </span>
              </span>
            </div>
          ))}
          {!t.players.length && <p className="p-4 ui muted text-sm">No players yet.</p>}
        </section>

        <section className="panel overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)]">
            <h2 className="text-lg m-0">
              {t.currentRound > 0 ? `Round ${t.currentRound} games` : "Games"}
            </h2>
          </div>
          {(t.currentRound > 0 ? roundGames : t.games).length === 0 ? (
            <p className="p-4 ui muted text-sm m-0">
              {t.status === "OPEN" ? "Games appear when the host starts the tournament." : "No games."}
            </p>
          ) : (
            (t.currentRound > 0 ? roundGames : t.games).map((g) => (
              <Link key={g.id} href={`/game/${g.id}`} className="table-row ui text-sm">
                <span>
                  {g.white?.username || "White"} vs {g.black?.username || "Black"}
                </span>
                <span className="muted shrink-0">
                  {g.status === "FINISHED" ? g.result || "done" : "live"}
                </span>
              </Link>
            ))
          )}
          {t.currentRound > 1 && (
            <div className="px-4 py-2 border-t border-[var(--line)]">
              <details className="ui text-sm">
                <summary className="cursor-pointer muted">Earlier rounds</summary>
                <ul className="mt-2 space-y-1 pl-0 list-none">
                  {t.games
                    .filter((g) => (g.tournamentRound || 0) < t.currentRound)
                    .map((g) => (
                      <li key={g.id}>
                        <Link href={`/game/${g.id}`} className="link-accent">
                          R{g.tournamentRound}: {g.white?.username} vs {g.black?.username}{" "}
                          {g.result || g.status}
                        </Link>
                      </li>
                    ))}
                </ul>
              </details>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
