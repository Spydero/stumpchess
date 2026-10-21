"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  _count: { threads: number };
};

function catInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "F";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export default function ForumPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);

  useEffect(() => {
    apiFetch("/api/forum/categories")
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const totalThreads = (categories || []).reduce((n, c) => n + (c._count?.threads || 0), 0);

  return (
    <div className="rise-in">
      <header className="forum-hero">
        <div>
          <p className="forum-kicker">Community</p>
          <h1>Forum</h1>
          <p className="muted ui text-sm mt-2 mb-0 max-w-lg">
            Openings, tactics, and club chat.
          </p>
        </div>
        {categories && categories.length > 0 && (
          <div className="ui text-sm muted flex gap-4">
            <div>
              <span className="block text-[var(--ink)] font-semibold text-lg leading-none">
                {categories.length}
              </span>
              categories
            </div>
            <div>
              <span className="block text-[var(--ink)] font-semibold text-lg leading-none">
                {totalThreads}
              </span>
              threads
            </div>
          </div>
        )}
      </header>

      {categories === null ? (
        <p className="pulse-soft ui muted">Loading categories…</p>
      ) : categories.length ? (
        <div className="forum-grid">
          {categories.map((c, i) => (
            <Link
              key={c.id}
              href={`/forum/${c.slug}`}
              className={`forum-cat rise-in rise-in-delay-${Math.min(3, (i % 3) + 1)}`}
            >
              <span className="forum-cat-icon" aria-hidden>
                {catInitials(c.name)}
              </span>
              <div>
                <h2>{c.name}</h2>
                <p className="m-0 mt-1 ui text-sm muted">{c.description}</p>
              </div>
              <div className="forum-cat-meta">
                <span className="forum-stat">{c._count.threads}</span>
                <span className="forum-stat-label">
                  {c._count.threads === 1 ? "thread" : "threads"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel forum-empty">
          <h3>No categories yet</h3>
          <p className="muted ui text-sm m-0">No categories yet.</p>
        </div>
      )}
    </div>
  );
}
