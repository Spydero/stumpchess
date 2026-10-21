"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PracticeBoard, type PracticeMode } from "@/components/PracticeBoard";
import { useSession } from "@/lib/auth-client";
import { useVipFeatures } from "@/lib/vip-features";

function parseMode(raw: string | null): PracticeMode {
  if (raw === "coach" || raw === "bot" || raw === "sandbox") return raw;
  return "sandbox";
}

function PracticeInner() {
  const search = useSearchParams();
  const { data, isPending } = useSession();
  const user = data?.user as { id: string; role?: string; vipExpiresAt?: string | null } | undefined;
  const vip = useVipFeatures(user);
  const initialMode = parseMode(search.get("mode"));

  if (isPending || vip.loading) {
    return <p className="pulse-soft ui muted">Loading…</p>;
  }

  if (!user) {
    return (
      <div className="panel p-6 max-w-lg rise-in">
        <p className="forum-kicker">Practice</p>
        <h1 className="text-3xl mt-1 mb-3">Sign in required</h1>
        <p className="muted ui text-sm mb-4">Log in to use Practice.</p>
        <Link href="/login" className="btn btn-accent">
          Log in
        </Link>
      </div>
    );
  }

  if (!vip.allowed) {
    return (
      <div className="panel p-6 max-w-lg rise-in">
        <p className="forum-kicker">VIP Practice</p>
        <h1 className="text-3xl mt-1 mb-3">VIP only</h1>
        <p className="muted ui text-sm mb-4">
          Practice is locked to VIP right now. Ask an LTA+ to open features for everyone, or get VIP.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/openings" className="btn btn-accent">
            Openings explorer
          </Link>
          <Link href="/play" className="btn btn-ghost">
            Play free vs computer
          </Link>
          <Link href="/forum" className="btn btn-ghost">
            Ask on the forum
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="forum-hero">
        <div>
          <p className="forum-kicker">{vip.personalVip ? "VIP" : "Open"}</p>
          <h1>Practice</h1>
          <p className="muted ui text-sm mt-2 mb-0 max-w-xl">
            Play both sides, vs a bot, or with a coach. Drill mistakes from your reviews.
            {vip.openToAll && !vip.personalVip ? " Open to all members." : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/openings" className="btn btn-ghost">
            Openings
          </Link>
          <Link href="/practice/mistakes" className="btn btn-ghost">
            Your mistakes
          </Link>
        </div>
      </header>
      <PracticeBoard key={initialMode} initialMode={initialMode} userId={user.id} />
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<p className="pulse-soft ui muted">Loading…</p>}>
      <PracticeInner />
    </Suspense>
  );
}
