"use client";

import Link from "next/link";
import { useSession, signOut } from "@/lib/auth-client";
import { RoleBadge } from "./RoleBadge";

export function Nav() {
  const { data } = useSession();
  const user = data?.user as
    | { id: string; name: string; username?: string; role?: string; image?: string | null }
    | undefined;

  return (
    <header className="border-b border-[var(--line)] bg-[rgba(255,252,246,0.75)] backdrop-blur-md sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-[family-name:var(--font-display)] text-xl tracking-tight">
          stump<span className="text-[var(--accent)]">chess</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm font-[family-name:var(--font-mono)]">
          <Link href="/play" className="hover:text-[var(--accent)]">
            Play
          </Link>
          <Link href="/forum" className="hover:text-[var(--accent)]">
            Forum
          </Link>
          <Link href="/analysis" className="hover:text-[var(--accent)]">
            Analysis
          </Link>
          <Link href="/search" className="hover:text-[var(--accent)]">
            Search
          </Link>
          {user ? (
            <>
              <Link href={`/u/${user.username || user.name}`} className="flex items-center gap-2">
                <span>{user.username || user.name}</span>
                {user.role && <RoleBadge role={user.role} />}
              </Link>
              {(user.role === "LTA" ||
                user.role === "MANAGER" ||
                user.role === "OWNER" ||
                user.role === "STA") && (
                <Link href="/admin" className="hover:text-[var(--accent)]">
                  Admin
                </Link>
              )}
              <button className="btn btn-ghost !py-1 !px-2" onClick={() => signOut()}>
                Out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-[var(--accent)]">
                Login
              </Link>
              <Link href="/register" className="btn btn-accent !py-1 !px-3">
                Join
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
