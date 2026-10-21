"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BOT_PRESETS, TIME_CONTROLS, type TimeControlId } from "@chess/shared";
import { useSession } from "@/lib/auth-client";
import { getSocket } from "@/lib/socket";
import { apiFetch } from "@/lib/api";

export default function PlayPage() {
  const { data, isPending } = useSession();
  const user = data?.user as { id: string; username?: string; name: string } | undefined;
  const router = useRouter();
  const [waiting, setWaiting] = useState(false);
  const [tc, setTc] = useState<TimeControlId>("5+0");
  const [botSkill, setBotSkill] = useState<number>(BOT_PRESETS[3].skill);
  const [botColor, setBotColor] = useState<"w" | "b">("w");
  const [challengeUser, setChallengeUser] = useState("");
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  const bot = BOT_PRESETS.find((b) => b.skill === botSkill) || BOT_PRESETS[3];

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
      const game = await apiFetch("/api/games/bot", {
        method: "POST",
        userId: user.id,
        body: JSON.stringify({ level: botSkill, color: botColor }),
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
        <p className="ui text-sm mb-4">
          <span className="font-semibold">{bot.elo} Elo</span>
          <span className="muted"> · {bot.label}</span>
        </p>
        <label className="block ui text-sm muted mb-2">Strength</label>
        <select
          className="input mb-4"
          value={botSkill}
          onChange={(e) => setBotSkill(Number(e.target.value))}
        >
          {BOT_PRESETS.map((b) => (
            <option key={b.skill} value={b.skill}>
              {b.elo} Elo · {b.label}
            </option>
          ))}
        </select>
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
          Start
        </button>
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
