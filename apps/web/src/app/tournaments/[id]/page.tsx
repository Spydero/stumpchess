"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatClubRating, ratingPoolFromTimeControl } from "@chess/shared";
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
  user: {
    id: string;
    username: string;
    role: string;
    rating?: number;
    ratingBullet?: number;
    rdBullet?: number;
    gamesBullet?: number;
    ratingBlitz?: number;
    rdBlitz?: number;
    gamesBlitz?: number;
    ratingRapid?: number;
    rdRapid?: number;
    gamesRapid?: number;
  };
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
  isPrivate: boolean;
  minRating: number | null;
  maxRating: number | null;
  inviteCount?: number;
  invites?: string[];
  host: { id: string; username: string; role: string };
  players: Player[];
  games: GameRow[];
};

function tourneySig(t: Tourney) {
  const players = t.players
    .map((p) => `${p.userId}:${p.score}:${p.wins}:${p.draws}:${p.losses}:${p.byes}`)
    .join(",");
  const games = t.games.map((g) => `${g.id}:${g.status}:${g.result || ""}:${g.tournamentRound}`).join(",");
  const invites = (t.invites || []).join(",");
  return `${t.status}|${t.currentRound}|${t.players.length}|${t.isPrivate}|${t.minRating}|${t.maxRating}|${invites}|${players}|${games}`;
}

function pollMs(status: string | undefined) {
  if (status === "OPEN") return 3_000;
  if (status === "RUNNING") return 5_000;
  return 20_000;
}

function eloLabel(t: Tourney) {
  const pool = ratingPoolFromTimeControl(t.timeControl);
  if (t.minRating == null && t.maxRating == null) return null;
  if (t.minRating != null && t.maxRating != null) {
    return `${pool} ${t.minRating}–${t.maxRating}`;
  }
  if (t.minRating != null) return `${pool} ${t.minRating}+`;
  return `${pool} ≤${t.maxRating}`;
}

function playerPoolRating(p: Player, timeControl: string) {
  const pool = ratingPoolFromTimeControl(timeControl);
  if (pool === "bullet") {
    return formatClubRating({
      rating: p.user.ratingBullet ?? 1200,
      rd: p.user.rdBullet ?? 350,
      games: p.user.gamesBullet ?? 0,
    });
  }
  if (pool === "rapid") {
    return formatClubRating({
      rating: p.user.ratingRapid ?? 1200,
      rd: p.user.rdRapid ?? 350,
      games: p.user.gamesRapid ?? 0,
    });
  }
  return formatClubRating({
    rating: p.user.ratingBlitz ?? 1200,
    rd: p.user.rdBlitz ?? 350,
    games: p.user.gamesBlitz ?? 0,
  });
}

export default function TournamentDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isPending } = useSession();
  const user = data?.user as { id: string } | undefined;
  const router = useRouter();
  const [t, setT] = useState<Tourney | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [invitesText, setInvitesText] = useState("");
  const [isPrivateEdit, setIsPrivateEdit] = useState(false);
  const [minRatingEdit, setMinRatingEdit] = useState("");
  const [maxRatingEdit, setMaxRatingEdit] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const sigRef = useRef("");
  const statusRef = useRef<string | undefined>(undefined);
  const userIdRef = useRef<string | undefined>(undefined);
  const formSeededFor = useRef<string | null>(null);
  const forceFormSync = useRef(false);
  userIdRef.current = user?.id;

  const load = useCallback(async () => {
    try {
      const next: Tourney = await apiFetch(`/api/tournaments/${params.id}`, {
        userId: userIdRef.current,
      });
      statusRef.current = next.status;
      const sig = tourneySig(next);
      if (sig === sigRef.current) return;
      sigRef.current = sig;
      setT(next);
      setError("");
      // Seed host form once (or after Save). Never clobber mid-typing on poll.
      const isHostViewer = !!userIdRef.current && userIdRef.current === next.hostId;
      if (
        isHostViewer &&
        (forceFormSync.current || formSeededFor.current !== next.id)
      ) {
        formSeededFor.current = next.id;
        forceFormSync.current = false;
        setInvitesText((next.invites || []).join("\n"));
        setIsPrivateEdit(!!next.isPrivate);
        setMinRatingEdit(next.minRating != null ? String(next.minRating) : "");
        setMaxRatingEdit(next.maxRating != null ? String(next.maxRating) : "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [params.id]);

  useEffect(() => {
    sigRef.current = "";
    statusRef.current = undefined;
    formSeededFor.current = null;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(tick, pollMs(statusRef.current));
    };

    const tick = () => {
      if (cancelled) return;
      void load().finally(schedule);
    };

    void load().finally(schedule);

    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [params.id, load]);

  // Re-fetch once session arrives so host gets invite list
  useEffect(() => {
    if (user?.id) {
      sigRef.current = "";
      void load();
    }
  }, [user?.id, load]);

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
      sigRef.current = "";
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingSettings(true);
    setError("");
    try {
      await apiFetch(`/api/tournaments/${params.id}`, {
        method: "PATCH",
        userId: user.id,
        body: JSON.stringify({
          isPrivate: isPrivateEdit,
          invites: invitesText
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          minRating: minRatingEdit.trim() ? Number(minRatingEdit) : null,
          maxRating: maxRatingEdit.trim() ? Number(maxRatingEdit) : null,
        }),
      });
      forceFormSync.current = true;
      sigRef.current = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  if (isPending || !t) {
    return <p className="pulse-soft ui muted">{error || "Loading…"}</p>;
  }

  const isHost = user?.id === t.hostId;
  const joined = !!user && t.players.some((p) => p.userId === user.id);
  const roundGames = t.games.filter((g) => g.tournamentRound === t.currentRound);
  const openThisRound = roundGames.filter((g) => g.status !== "FINISHED").length;
  const elo = eloLabel(t);

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
              {t.players.length}/{t.maxPlayers} players · {t.isPrivate ? "Private" : "Public"}
              {elo ? ` · ${elo}` : ""}
              {t.status === "OPEN" ? " · live" : ""}
            </p>
            {t.description && <p className="ui text-sm mt-2 mb-0">{t.description}</p>}
          </div>
          <span className={`tourney-status tourney-status--${t.status.toLowerCase()}`}>
            {t.status}
          </span>
        </div>
      </header>

      {error && <p className="text-[var(--danger)] ui text-sm mb-3">{error}</p>}

      {t.status === "OPEN" && isHost && (
        <p className="ui text-xs muted mb-3">
          Standings update when players join or leave (no flicker if nothing changed). Confirm the
          list before starting.
        </p>
      )}

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

      {isHost && t.status === "OPEN" && (
        <form onSubmit={saveSettings} className="panel p-4 mb-5 space-y-3">
          <h2 className="text-lg m-0">Entry settings</h2>
          <div className="flex flex-wrap gap-4 ui text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={!isPrivateEdit}
                onChange={() => setIsPrivateEdit(false)}
              />
              Public
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={isPrivateEdit} onChange={() => setIsPrivateEdit(true)} />
              Private (whitelist)
            </label>
          </div>
          {isPrivateEdit && (
            <div>
              <label className="ui text-xs muted block mb-1">
                Allowed usernames ({t.inviteCount ?? 0} saved)
              </label>
              <textarea
                className="input min-h-24"
                value={invitesText}
                onChange={(e) => setInvitesText(e.target.value)}
                placeholder="one username per line"
              />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="ui text-xs muted block mb-1">Min Elo</label>
              <input
                className="input"
                type="number"
                min={100}
                max={3200}
                value={minRatingEdit}
                onChange={(e) => setMinRatingEdit(e.target.value)}
                placeholder="none"
              />
            </div>
            <div>
              <label className="ui text-xs muted block mb-1">Max Elo</label>
              <input
                className="input"
                type="number"
                min={100}
                max={3200}
                value={maxRatingEdit}
                onChange={(e) => setMaxRatingEdit(e.target.value)}
                placeholder="none"
              />
            </div>
          </div>
          <button type="submit" className="btn btn-accent" disabled={savingSettings}>
            {savingSettings ? "Saving…" : "Save entry settings"}
          </button>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between gap-2">
            <h2 className="text-lg m-0">Standings</h2>
            <span className="ui text-xs muted tabular-nums">
              {t.players.length}/{t.maxPlayers}
            </span>
          </div>
          {t.players.map((p, i) => (
            <div key={p.userId} className="table-row ui text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className="muted w-5">{i + 1}</span>
                <Link href={`/u/${p.user.username}`} className="font-semibold truncate">
                  {p.user.username}
                </Link>
                {p.user.role !== "MEMBER" && <RoleBadge role={p.user.role} />}
                <span className="muted text-xs tabular-nums">{playerPoolRating(p, t.timeControl)}</span>
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
