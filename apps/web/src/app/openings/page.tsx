"use client";

import { useSession } from "@/lib/auth-client";
import { userHasVip } from "@/lib/roles";
import { OpeningsExplorer } from "@/components/OpeningsExplorer";
import { bookMeta } from "@/lib/openings";

export default function OpeningsPage() {
  const { data, isPending } = useSession();
  const user = data?.user as
    | { role?: string; vipExpiresAt?: string | null }
    | undefined;
  const isVip = user ? userHasVip(user.role || "MEMBER", user.vipExpiresAt) : false;
  const meta = bookMeta();

  return (
    <div className="rise-in">
      <header className="page-hero mb-6">
        <p className="forum-kicker">Explore</p>
        <h1 className="text-3xl sm:text-4xl mt-1 mb-2">Openings</h1>
        <p className="muted ui text-base max-w-xl m-0">
          Browse named openings from a local ECO book ({meta.lines.toLocaleString()} lines). Optional
          Stockfish analysis for VIP.
        </p>
      </header>

      {isPending ? (
        <p className="ui muted pulse-soft">Loading…</p>
      ) : (
        <OpeningsExplorer isVip={isVip} />
      )}
    </div>
  );
}
