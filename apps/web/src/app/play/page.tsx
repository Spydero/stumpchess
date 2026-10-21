"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TIME_CONTROLS, type TimeControlId } from "@chess/shared";
import { useSession } from "@/lib/auth-client";
import { getSocket } from "@/lib/socket";
import { apiFetch } from "@/lib/api";
import Link from "next/link";

export default function PlayPage() {
  const { data, isPending } = useSession();
  const user = data?.user as { id: string; username?: string; name: string } | undefined;
  const router = useRouter();
  const [waiting, setWaiting] = useState(false);
  const [tc, setTc] = useState<TimeControlId>("5+0");
  const [botLevel, setBotLevel] = useState(5);
  const [error, setError] = useState("");

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
        body: JSON.stringify({ level: botLevel, color: "w" }),
      });
      router.push(`/game/${game.id}?bot=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  if (isPending) return <p className="pulse-soft">Loading…</p>;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="panel p-6 rise">
        <h1 className="text-3xl mb-2">Play</h1>
        <p className="text-[var(--muted)] mb-6 text-sm font-[family-name:var(--font-mono)]">
          Join the queue — you&apos;ll be paired with whoever is waiting.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {TIME_CONTROLS.map((t) => (
            <button
              key={t.id}
              className={`btn ${tc === t.id ? "btn-accent" : "btn-ghost"} !py-2`}
              onClick={() => setTc(t.id)}
              disabled={waiting}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!waiting ? (
          <button className="btn btn-accent" onClick={joinQueue}>
            Find opponent
          </button>
        ) : (
          <div className="space-y-3">
            <p className="pulse-soft font-[family-name:var(--font-mono)] text-sm">
              Waiting for opponent…
            </p>
            <button className="btn btn-ghost" onClick={leaveQueue}>
              Cancel
            </button>
          </div>
        )}
        {error && <p className="text-[var(--danger)] mt-3 text-sm">{error}</p>}
      </section>

      <section className="panel p-6 rise" style={{ animationDelay: "80ms" }}>
        <h2 className="text-2xl mb-2">Play vs Bot</h2>
        <p className="text-[var(--muted)] mb-4 text-sm">
          Stockfish runs in your browser. Free for all Members.
        </p>
        <label className="block text-sm font-[family-name:var(--font-mono)] mb-2">
          Level {botLevel}
        </label>
        <input
          type="range"
          min={1}
          max={15}
          value={botLevel}
          onChange={(e) => setBotLevel(Number(e.target.value))}
          className="w-full mb-4"
        />
        <button className="btn btn-accent" onClick={playBot}>
          Start bot game
        </button>
        <p className="mt-6 text-sm text-[var(--muted)]">
          Want engine labels on a PGN?{" "}
          <Link href="/analysis" className="underline">
            VIP Analysis
          </Link>
        </p>
      </section>
    </div>
  );
}
