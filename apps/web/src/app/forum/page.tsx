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
    <div>
      <h1 className="text-3xl mb-4">Forum</h1>
      <div className="panel">
        {categories.map((c) => (
          <Link key={c.id} href={`/forum/${c.slug}`} className="table-row">
            <div>
              <h2 className="text-lg m-0">{c.name}</h2>
              <p className="m-0 mt-1 ui text-sm muted">{c.description}</p>
            </div>
            <span className="ui text-sm muted shrink-0">{c._count.threads}</span>
          </Link>
        ))}
        {!categories.length && <p className="p-4 muted ui text-sm">No categories.</p>}
      </div>
    </div>
  );
}
