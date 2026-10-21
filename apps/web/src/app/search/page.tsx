"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { RoleBadge } from "@/components/RoleBadge";

type UserHit = { id: string; username: string; role: string; image?: string | null };

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);

  async function search(value: string) {
    setQ(value);
    if (!value.trim()) {
      setHits([]);
      return;
    }
    const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(value)}`);
    setHits(res);
  }

  return (
    <div className="max-w-xl rise">
      <h1 className="text-3xl mb-4">Search players</h1>
      <input
        className="input mb-4"
        placeholder="Username…"
        value={q}
        onChange={(e) => search(e.target.value)}
      />
      <div className="panel divide-y divide-[var(--line)]">
        {hits.map((u) => (
          <Link
            key={u.id}
            href={`/u/${u.username}`}
            className="flex items-center gap-3 p-3 hover:bg-[rgba(47,111,78,0.06)]"
          >
            {u.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.image} alt="" className="w-8 h-8 border border-[var(--line)]" />
            )}
            <span>{u.username}</span>
            <RoleBadge role={u.role} />
          </Link>
        ))}
        {q && !hits.length && <p className="p-3 text-[var(--muted)]">No users found.</p>}
      </div>
    </div>
  );
}
