"use client";

import { useSession } from "@/lib/auth-client";
import { userHasVip } from "@/lib/roles";
import { OpeningsExplorer } from "@/components/OpeningsExplorer";

export default function OpeningsPage() {
  const { data, isPending } = useSession();
  const user = data?.user as
    | { role?: string; vipExpiresAt?: string | null }
    | undefined;
  const isVip = user ? userHasVip(user.role || "MEMBER", user.vipExpiresAt) : false;

  return (
    <div className="rise-in openings-page">
      <header className="openings-page-head">
        <h1 className="openings-page-title">Openings</h1>
        <p className="openings-page-sub muted ui">
          Local ECO book explorer. Optional Stockfish on the board.
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
