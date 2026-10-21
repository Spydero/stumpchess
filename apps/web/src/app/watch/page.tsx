"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { apiFetch } from "@/lib/api";

type LiveGame = {
  id: string;
  timeControl: string;
  fen?: string;
  startedAt: string | null;
  white: { id?: string; username: string } | null;
  black: { id?: string; username: string } | null;
};

type UserHit = { id: string; username: string; role: string; image?: string | null };

function liveSig(games: LiveGame[]) {
  return games.map((g) => `${g.id}:${g.fen || ""}:${g.timeControl}`).join("|");
}

function WatchInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialUser = (searchParams.get("u") || "").trim();

  const [games, setGames] = useState<LiveGame[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(initialUser);
  const [filterUser, setFilterUser] = useState(initialUser);
  const [hits, setHits] = useState<UserHit[]>([]);
  const sigRef = useRef("");
  const filterRef = useRef(filterUser);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  filterRef.current = filterUser;

  const load = useCallback(async () => {
    try {
      const u = filterRef.current.trim();
      const url = u
        ? `/api/games/live?username=${encodeURIComponent(u)}`
        : "/api/games/live";
      const next: LiveGame[] = await apiFetch(url);
      const sig = liveSig(next);
      if (sig === sigRef.current) return;
      sigRef.current = sig;
      setGames(next);
      setError("");
    } catch (e) {
      setGames([]);
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    const u = (searchParams.get("u") || "").trim();
    setQuery(u);
    setFilterUser(u);
    sigRef.current = "";
  }, [searchParams]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 10_000);
    return () => clearInterval(id);
  }, [load, filterUser]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  function onSearchType(value: string) {
    setQuery(value);
    const q = value.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 1) {
      setHits([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((res: UserHit[]) => setHits(res))
        .catch(() => setHits([]));
    }, 220);
  }

  function watchUser(username: string) {
    setHits([]);
    setQuery(username);
    setFilterUser(username);
    sigRef.current = "";
    router.replace(`/watch?u=${encodeURIComponent(username)}`);
  }

  function clearFilter() {
    setHits([]);
    setQuery("");
    setFilterUser("");
    sigRef.current = "";
    router.replace("/watch");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const u = query.trim();
    if (!u) {
      clearFilter();
      return;
    }
    watchUser(u);
  }

  return (
    <div className="rise-in">
      <header className="page-hero mb-5">
        <p className="forum-kicker">Live</p>
        <h1 className="text-3xl sm:text-4xl mt-1 mb-2">Watch</h1>
        <p className="muted ui text-base max-w-xl m-0">
          Spectate club games. Find any player by username (same people you message or search).
        </p>
      </header>

      <form onSubmit={onSubmit} className="panel p-4 mb-4 space-y-3">
        <label className="ui text-xs muted block m-0">Find a player</label>
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1 min-w-[12rem]"
            placeholder="Username"
            value={query}
            onChange={(e) => void onSearchType(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-accent">
            Watch
          </button>
          {filterUser ? (
            <button type="button" className="btn btn-ghost" onClick={clearFilter}>
              All live
            </button>
          ) : null}
        </div>
        {hits.length > 0 && (
          <div className="border border-[var(--line)] rounded-sm overflow-hidden">
            {hits.map((u) => (
              <button
                key={u.id}
                type="button"
                className="table-row ui text-sm w-full text-left"
                onClick={() => watchUser(u.username)}
              >
                <span className="flex items-center gap-2">
                  {u.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.image} alt="" className="w-7 h-7 border border-[var(--line)]" />
                  ) : null}
                  <span className="font-semibold">{u.username}</span>
                </span>
                <span className="link-accent shrink-0">Watch</span>
              </button>
            ))}
          </div>
        )}
        <p className="ui text-xs muted m-0">
          Or open someone from{" "}
          <Link href="/search" className="link-accent">
            Search
          </Link>
          ,{" "}
          <Link href="/messages" className="link-accent">
            Messages
          </Link>
          , or their profile.
        </p>
      </form>

      {error && <p className="text-[var(--danger)] ui text-sm mb-3">{error}</p>}

      <div className="panel overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between gap-2">
          <h2 className="text-lg m-0">
            {filterUser ? (
              <>
                Live ·{" "}
                <Link href={`/u/${filterUser}`} className="link-accent">
                  {filterUser}
                </Link>
              </>
            ) : (
              "Games now"
            )}
          </h2>
          <button type="button" className="btn btn-ghost !py-1 !px-2 !text-xs" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        {games.length === 0 ? (
          <div className="forum-empty">
            <h3>{filterUser ? "Not playing right now" : "No live games"}</h3>
            <p className="muted ui text-sm mb-3">
              {filterUser ? (
                <>
                  Check their{" "}
                  <Link href={`/u/${filterUser}`} className="link-accent">
                    profile
                  </Link>{" "}
                  for finished games, or watch the whole club.
                </>
              ) : (
                "Queue up or challenge someone to get a game going."
              )}
            </p>
            {filterUser ? (
              <div className="flex flex-wrap gap-2 justify-center">
                <Link href={`/u/${filterUser}`} className="btn btn-accent">
                  Profile
                </Link>
                <button type="button" className="btn btn-ghost" onClick={clearFilter}>
                  All live
                </button>
              </div>
            ) : (
              <Link href="/play" className="btn btn-accent">
                Play
              </Link>
            )}
          </div>
        ) : (
          games.map((g) => (
            <Link key={g.id} href={`/game/${g.id}`} className="table-row ui text-sm">
              <span>
                {g.white?.username || "White"} vs {g.black?.username || "Black"}
              </span>
              <span className="muted shrink-0 flex items-center gap-2">
                <span className="live-dot" aria-hidden />
                {g.timeControl}
                <span className="link-accent">Watch</span>
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export default function WatchPage() {
  return (
    <Suspense fallback={<p className="pulse-soft ui muted">Loading…</p>}>
      <WatchInner />
    </Suspense>
  );
}
