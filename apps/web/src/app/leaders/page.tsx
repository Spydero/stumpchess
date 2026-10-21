"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { RoleBadge } from "@/components/RoleBadge";

type Leader = {
  id: string;
  username: string;
  role: string;
  image?: string | null;
  wins: number;
  losses: number;
  draws: number;
};

export default function LeadersPage() {
  const [leaders, setLeaders] = useState<Leader[]>([]);

  useEffect(() => {
    apiFetch("/api/users/leaders").then(setLeaders).catch(() => setLeaders([]));
  }, []);

  return (
    <div>
      <h1 className="text-3xl mb-4">Leaders</h1>
      <div className="panel">
        {leaders.map((u, i) => (
          <Link key={u.id} href={`/u/${u.username}`} className="table-row ui text-sm">
            <div className="flex items-center gap-3 min-w-0">
              <span className="muted w-6 shrink-0">{i + 1}</span>
              {u.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.image} alt="" className="w-8 h-8 border border-[var(--line)] shrink-0" />
              )}
              <span className="truncate font-semibold">{u.username}</span>
              {u.role !== "MEMBER" && <RoleBadge role={u.role} />}
            </div>
            <span className="muted shrink-0">
              {u.wins}W {u.losses}L {u.draws}D
            </span>
          </Link>
        ))}
        {!leaders.length && <p className="p-4 muted ui text-sm">No ranked players yet.</p>}
      </div>
    </div>
  );
}
