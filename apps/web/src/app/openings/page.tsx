"use client";

import { useSession } from "@/lib/auth-client";
import { OpeningsExplorer } from "@/components/OpeningsExplorer";
import { useVipFeatures } from "@/lib/vip-features";

export default function OpeningsPage() {
  const { data, isPending } = useSession();
  const user = data?.user as
    | { id: string; role?: string; vipExpiresAt?: string | null }
    | undefined;
  const vip = useVipFeatures(user);

  return (
    <div className="rise-in openings-page">
      <header className="openings-page-head">
        <h1 className="openings-page-title">Openings</h1>
        <p className="openings-page-sub muted ui">
          Local ECO book explorer. Optional Stockfish on the board.
        </p>
      </header>

      {isPending || vip.loading ? (
        <p className="ui muted pulse-soft">Loading…</p>
      ) : (
        <OpeningsExplorer isVip={vip.allowed} />
      )}
    </div>
  );
}
