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

export default function ForumPage() {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    apiFetch("/api/forum/categories").then(setCategories).catch(() => setCategories([]));
  }, []);

  return (
    <div className="rise">
      <h1 className="text-4xl mb-2">Forum</h1>
      <p className="text-[var(--muted)] mb-8 font-[family-name:var(--font-mono)] text-sm">
        Old-school boards. Pick a category.
      </p>
      <div className="panel divide-y divide-[var(--line)]">
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/forum/${c.slug}`}
            className="flex items-start justify-between gap-4 p-4 hover:bg-[rgba(47,111,78,0.06)] transition-colors"
          >
            <div>
              <h2 className="text-xl">{c.name}</h2>
              <p className="text-sm text-[var(--muted)]">{c.description}</p>
            </div>
            <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--muted)] shrink-0">
              {c._count.threads} threads
            </span>
          </Link>
        ))}
        {!categories.length && (
          <p className="p-4 text-[var(--muted)]">No categories yet — run db seed.</p>
        )}
      </div>
    </div>
  );
}
