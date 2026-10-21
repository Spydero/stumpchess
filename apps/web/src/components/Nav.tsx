"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import { RoleBadge } from "./RoleBadge";
import { useTheme } from "./ThemeProvider";

const LINKS = [
  { href: "/play", label: "Play" },
  { href: "/games", label: "Games" },
  { href: "/leaders", label: "Leaders" },
  { href: "/forum", label: "Forum" },
  { href: "/analysis", label: "Analysis" },
  { href: "/search", label: "Search" },
];

export function Nav() {
  const { data } = useSession();
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const user = data?.user as
    | { id: string; name: string; username?: string; role?: string; image?: string | null }
    | undefined;

  const isStaff =
    user?.role === "LTA" ||
    user?.role === "MANAGER" ||
    user?.role === "OWNER" ||
    user?.role === "STA";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--header)] backdrop-blur-md">
      <div className="shell flex items-center justify-between gap-3 py-2.5">
        <Link href="/" className="text-lg sm:text-xl shrink-0" onClick={() => setOpen(false)}>
          stump<span className="text-[var(--accent)]">chess</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 lg:gap-2 ui text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-2 py-1 rounded-sm ${
                pathname.startsWith(l.href) ? "text-[var(--nav-active)] font-semibold" : "muted hover:text-[var(--ink)]"
              }`}
            >
              {l.label}
            </Link>
          ))}
          {user ? (
            <>
              <Link href={`/u/${user.username || user.name}`} className="flex items-center gap-1.5 px-2">
                <span>{user.username || user.name}</span>
                {user.role && user.role !== "MEMBER" && <RoleBadge role={user.role} />}
              </Link>
              {isStaff && (
                <Link href="/admin" className="px-2 muted hover:text-[var(--ink)]">
                  Admin
                </Link>
              )}
              <button type="button" className="btn btn-ghost !py-1 !px-2" onClick={() => signOut()}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="px-2 muted hover:text-[var(--ink)]">
                Login
              </Link>
              <Link href="/register" className="btn btn-accent !py-1 !px-3">
                Register
              </Link>
            </>
          )}
          <button
            type="button"
            className="btn btn-ghost !py-1 !px-2 ml-1"
            onClick={toggle}
            aria-label="Toggle theme"
            title={theme === "light" ? "Dark mode" : "Light mode"}
          >
            {theme === "light" ? "Dark" : "Light"}
          </button>
        </nav>

        <div className="flex md:hidden items-center gap-2">
          <button type="button" className="btn btn-ghost !py-1 !px-2 ui text-xs" onClick={toggle}>
            {theme === "light" ? "Dark" : "Light"}
          </button>
          <button
            type="button"
            className="btn btn-ghost !py-1 !px-2 ui text-sm"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Menu"
          >
            Menu
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-[var(--line)] bg-[var(--panel)] ui text-sm">
          <div className="shell py-2 flex flex-col">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="py-2.5 border-b border-[var(--line)]"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            {user ? (
              <>
                <Link
                  href={`/u/${user.username || user.name}`}
                  className="py-2.5 border-b border-[var(--line)] flex items-center gap-2"
                  onClick={() => setOpen(false)}
                >
                  {user.username || user.name}
                  {user.role && user.role !== "MEMBER" && <RoleBadge role={user.role} />}
                </Link>
                {isStaff && (
                  <Link href="/admin" className="py-2.5 border-b border-[var(--line)]" onClick={() => setOpen(false)}>
                    Admin
                  </Link>
                )}
                <button
                  type="button"
                  className="py-2.5 text-left"
                  onClick={() => {
                    setOpen(false);
                    signOut();
                  }}
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="py-2.5 border-b border-[var(--line)]" onClick={() => setOpen(false)}>
                  Login
                </Link>
                <Link href="/register" className="py-2.5" onClick={() => setOpen(false)}>
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
