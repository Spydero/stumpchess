"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ENGINE_ELO_FULL,
  ENGINE_ELO_MAX,
  ENGINE_ELO_MIN,
  PERSONALITY_BOTS,
  STOCKFISH_BOT,
  TIME_CONTROLS,
  clampEngineElo,
  encodeBotLevel,
  formatEngineElo,
  isEngineFullStrength,
  playableBotById,
  type TimeControlId,
} from "@chess/shared";
import { useSession } from "@/lib/auth-client";
import { getSocket } from "@/lib/socket";
import { apiFetch } from "@/lib/api";
import { userHasVip } from "@/lib/roles";

export default function PlayPage() {
  const { data, isPending } = useSession();
  const user = data?.user as
    | { id: string; username?: string; name: string; role?: string; vipExpiresAt?: string | null }
    | undefined;
  const router = useRouter();
  const [waiting, setWaiting] = useState(false);
  const [tc, setTc] = useState<TimeControlId>("5+0");
  const [botId, setBotId] = useState<string>(PERSONALITY_BOTS[3].id);
  const [engineElo, setEngineElo] = useState(2000);
  const [botColor, setBotColor] = useState<"w" | "b">("w");
  const [challengeUser, setChallengeUser] = useState("");
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  const bot = playableBotById(botId);
  const isVip = user ? userHasVip(user.role || "MEMBER", user.vipExpiresAt) : false;

  useEffect(() => {
    if (!user) return;
    const s = getSocket();
    s.connect();
    s.emit("auth", { userId: user.id, username: user.username || user.name });

    const onMatched = (payload: { gameId: string }) => {
      setWaiting(false);
      router.push(`/game/${payload.gameId}`);
    };
    const onWaiting = () => setWaiting(true);
    const onErr = (p: { message: string }) => {
      setError(p.message);
      setWaiting(false);
    };

    s.on("queue:matched", onMatched);
    s.on("queue:waiting", onWaiting);
    s.on("error", onErr);
    return () => {
      s.off("queue:matched", onMatched);
      s.off("queue:waiting", onWaiting);
      s.off("error", onErr);
    };
  }, [user, router]);

  function joinQueue() {
    if (!user) return router.push("/login");
    setError("");
    setInviteUrl("");
    getSocket().emit("queue:join", { timeControl: tc });
  }

  function leaveQueue() {
    getSocket().emit("queue:leave");
    setWaiting(false);
  }

  async function playBot() {
    if (!user) return router.push("/login");
    try {
      const level =
        bot.kind === "engine"
          ? encodeBotLevel({ kind: "engine", elo: engineElo })
          : encodeBotLevel({ kind: "personality", skill: bot.skill });
      const game = await apiFetch("/api/games/bot", {
        method: "POST",
        userId: user.id,
        body: JSON.stringify({ level, color: botColor }),
      });
      router.push(`/game/${game.id}?bot=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function challenge(e: FormEvent) {
    e.preventDefault();
    if (!user) return router.push("/login");
    setError("");
    try {
      const game = await apiFetch("/api/games/challenge", {
        method: "POST",
        userId: user.id,
        body: JSON.stringify({ username: challengeUser.trim(), timeControl: tc }),
      });
      const url = `${window.location.origin}/game/${game.id}`;
      setInviteUrl(url);
      router.push(`/game/${game.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Challenge failed");
    }
  }

  if (isPending) return <p className="pulse-soft ui muted">Loading…</p>;

  return (
    <div className="grid gap-4 md:gap-5 md:grid-cols-2 xl:grid-cols-3">
      <section className="panel p-5">
        <h1 className="text-2xl sm:text-3xl mb-4">Quick match</h1>
        <div className="flex flex-wrap gap-2 mb-4">
          {TIME_CONTROLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`btn ${tc === t.id ? "btn-accent" : "btn-ghost"} !py-2`}
              onClick={() => setTc(t.id)}
              disabled={waiting}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!waiting ? (
          <button type="button" className="btn btn-accent w-full sm:w-auto" onClick={joinQueue}>
            Find opponent
          </button>
        ) : (
          <div className="space-y-3">
            <p className="pulse-soft ui text-sm muted">Waiting for opponent…</p>
            <button type="button" className="btn btn-ghost" onClick={leaveQueue}>
              Cancel
            </button>
          </div>
        )}
      </section>

      <section id="bot" className="panel p-5">
        <h2 className="text-2xl sm:text-3xl mb-2">vs Computer</h2>
        <p className="ui text-sm mb-1">
          <span className="font-semibold">{bot.name}</span>
          <span className="muted">
            {" · "}
            {bot.kind === "engine"
              ? isEngineFullStrength(engineElo)
                ? "Max"
                : `~${formatEngineElo(engineElo)} Elo`
              : `~${bot.elo} Elo · ${bot.style}`}
          </span>
        </p>
        <p className="ui text-xs muted mb-4">{bot.tagline}</p>
        <label className="block ui text-sm muted mb-2">Opponent</label>
        <select className="input mb-3" value={botId} onChange={(e) => setBotId(e.target.value)}>
          <optgroup label="Personality">
            {PERSONALITY_BOTS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.elo} · {b.style}
              </option>
            ))}
          </optgroup>
          <optgroup label="Engine">
            <option value={STOCKFISH_BOT.id}>{STOCKFISH_BOT.name}</option>
          </optgroup>
        </select>
        {bot.kind === "engine" && (
          <div className="mb-4 space-y-2">
            <label className="block ui text-xs muted">
              Elo {isEngineFullStrength(engineElo) ? "(Max)" : formatEngineElo(engineElo)}
            </label>
            <input
              type="range"
              min={ENGINE_ELO_MIN}
              max={ENGINE_ELO_MAX + 50}
              step={50}
              value={isEngineFullStrength(engineElo) ? ENGINE_ELO_MAX + 50 : engineElo}
              onChange={(e) => {
                const v = Number(e.target.value);
                setEngineElo(v > ENGINE_ELO_MAX ? ENGINE_ELO_FULL : clampEngineElo(v));
              }}
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex flex-wrap gap-1">
              {[1200, 1600, 2000, 2400, ENGINE_ELO_FULL].map((e) => (
                <button
                  key={e === ENGINE_ELO_FULL ? "max" : e}
                  type="button"
                  className={`btn !px-2 !py-1 !text-xs ${
                    (e === ENGINE_ELO_FULL && isEngineFullStrength(engineElo)) || engineElo === e
                      ? "btn-accent"
                      : "btn-ghost"
                  }`}
                  onClick={() => setEngineElo(e)}
                >
                  {e === ENGINE_ELO_FULL ? "Max" : e}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            className={`btn flex-1 ${botColor === "w" ? "btn-accent" : "btn-ghost"}`}
            onClick={() => setBotColor("w")}
          >
            White
          </button>
          <button
            type="button"
            className={`btn flex-1 ${botColor === "b" ? "btn-accent" : "btn-ghost"}`}
            onClick={() => setBotColor("b")}
          >
            Black
          </button>
        </div>
        <button type="button" className="btn btn-accent w-full sm:w-auto" onClick={playBot}>
          Start game
        </button>
        <p className="ui text-xs muted mt-3 mb-0">
          {isVip ? (
            <>
              VIP:{" "}
              <Link href="/practice?mode=coach" className="link-accent">
                Play with coach
              </Link>
              {" · "}
              <Link href="/practice" className="link-accent">
                Practice board
              </Link>
              {" · "}
              <Link href="/practice/mistakes" className="link-accent">
                Your mistakes
              </Link>
            </>
          ) : (
            <>
              Coach and mistake drills need VIP.{" "}
              <Link href="/practice" className="link-accent">
                Practice
              </Link>
            </>
          )}
        </p>
      </section>

      <section className="panel p-5 md:col-span-2 xl:col-span-1">
        <h2 className="text-2xl sm:text-3xl mb-4">Challenge</h2>
        <form onSubmit={challenge} className="space-y-3">
          <input
            className="input"
            placeholder="Username"
            value={challengeUser}
            onChange={(e) => setChallengeUser(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-accent w-full sm:w-auto">
            Send challenge
          </button>
        </form>
        {inviteUrl && (
          <p className="mt-3 ui text-xs muted break-all">Invite: {inviteUrl}</p>
        )}
      </section>

      {error && (
        <p className="text-[var(--danger)] ui text-sm md:col-span-2 xl:col-span-3">{error}</p>
      )}
    </div>
  );
}
