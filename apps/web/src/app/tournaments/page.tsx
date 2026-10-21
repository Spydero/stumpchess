"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TIME_CONTROLS, canHostTournament, type Role, type TimeControlId } from "@chess/shared";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";

type Tourney = {
  id: string;
  name: string;
  status: string;
  timeControl: string;
  maxRounds: number;
  currentRound: number;
  maxPlayers: number;
  host: { username: string };
  _count: { players: number; games: number };
};

export default function TournamentsPage() {
  const { data, isPending } = useSession();
  const user = data?.user as
    | { id: string; role?: string; vipExpiresAt?: string | null }
    | undefined;
  const router = useRouter();
  const [list, setList] = useState<Tourney[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [tc, setTc] = useState<TimeControlId>("5+0");
  const [maxRounds, setMaxRounds] = useState(4);
  const [creating, setCreating] = useState(false);

  const canHost = user
    ? canHostTournament((user.role as Role) || "MEMBER", user.vipExpiresAt)
    : false;

  function load() {
    apiFetch("/api/tournaments")
      .then(setList)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!user) return router.push("/login");
    setCreating(true);
    setError("");
    try {
      const t = await apiFetch("/api/tournaments", {
        method: "POST",
        userId: user.id,
        body: JSON.stringify({ name, timeControl: tc, maxRounds }),
      });
      router.push(`/tournaments/${t.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setCreating(false);
    }
  }

  if (isPending) return <p className="pulse-soft ui muted">Loading…</p>;

  return (
    <div className="rise-in">
      <header className="page-hero mb-5">
        <p className="forum-kicker">Events</p>
        <h1 className="text-3xl sm:text-4xl mt-1 mb-2">Tournaments</h1>
        <p className="muted ui text-base max-w-xl m-0">
          Swiss club events. Hosts need VIP or the Tournament Host role.
        </p>
      </header>

      {canHost && (
        <form onSubmit={create} className="panel p-4 mb-5 grid gap-3 md:grid-cols-[1.4fr_auto_auto_auto]">
          <input
            className="input"
            placeholder="Tournament name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
          <select className="input" value={tc} onChange={(e) => setTc(e.target.value as TimeControlId)}>
            {TIME_CONTROLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={maxRounds}
            onChange={(e) => setMaxRounds(Number(e.target.value))}
          >
            {[3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n} rounds
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-accent" disabled={creating}>
            {creating ? "…" : "Create"}
          </button>
        </form>
      )}

      {!canHost && user && (
        <p className="ui text-sm muted mb-4">
          Need VIP or Tournament Host to create events. Ask an LTA+ on Admin.
        </p>
      )}

      {error && <p className="text-[var(--danger)] ui text-sm mb-3">{error}</p>}

      <div className="panel overflow-hidden">
        {list.length === 0 ? (
          <div className="forum-empty">
            <h3>No tournaments yet</h3>
            <p className="muted ui text-sm mb-0">A host can create the first one above.</p>
          </div>
        ) : (
          list.map((t) => (
            <Link key={t.id} href={`/tournaments/${t.id}`} className="table-row ui text-sm">
              <span className="min-w-0">
                <span className="font-semibold">{t.name}</span>
                <span className="block muted text-xs mt-0.5">
                  Host {t.host.username} · {t.timeControl} · {t._count.players}/{t.maxPlayers} players
                  {t.status === "RUNNING" ? ` · Round ${t.currentRound}/${t.maxRounds}` : ""}
                </span>
              </span>
              <span className={`tourney-status tourney-status--${t.status.toLowerCase()}`}>
                {t.status}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
