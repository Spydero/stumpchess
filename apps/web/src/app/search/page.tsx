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
    <div className="max-w-xl">
      <h1 className="text-3xl mb-4">Search</h1>
      <input
        className="input mb-4"
        placeholder="Username"
        value={q}
        onChange={(e) => search(e.target.value)}
      />
      <div className="panel">
        {hits.map((u) => (
          <div key={u.id} className="table-row ui text-sm">
            <Link href={`/u/${u.username}`} className="flex items-center gap-3 min-w-0 flex-1">
              {u.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.image} alt="" className="w-8 h-8 border border-[var(--line)] shrink-0" />
              )}
              <span className="font-semibold truncate">{u.username}</span>
              {u.role !== "MEMBER" && <RoleBadge role={u.role} />}
            </Link>
            <span className="flex gap-2 shrink-0">
              <Link href={`/watch?u=${encodeURIComponent(u.username)}`} className="link-accent">
                Watch
              </Link>
              <Link href={`/u/${u.username}`} className="muted">
                Profile
              </Link>
            </span>
          </div>
        ))}
        {q && !hits.length && <p className="p-4 muted ui text-sm">No users found.</p>}
      </div>
    </div>
  );
}
