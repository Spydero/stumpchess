"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import { RoleBadge } from "./RoleBadge";
import { useTheme } from "./ThemeProvider";

const PRIMARY = [
  { href: "/play", label: "Play" },
  { href: "/watch", label: "Watch" },
  { href: "/tournaments", label: "Events" },
  { href: "/openings", label: "Openings" },
  { href: "/practice", label: "Practice" },
  { href: "/games", label: "Games" },
];

const MORE = [
  { href: "/messages", label: "Messages" },
  { href: "/forum", label: "Forum" },
  { href: "/analysis", label: "Analysis" },
  { href: "/leaders", label: "Leaders" },
  { href: "/search", label: "Search" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const { data } = useSession();
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const user = data?.user as
    | { id: string; name: string; username?: string; role?: string; image?: string | null }
    | undefined;

  const isStaff =
    user?.role === "LTA" ||
    user?.role === "MANAGER" ||
    user?.role === "OWNER" ||
    user?.role === "STA";

  const moreActive = MORE.some((l) => pathname.startsWith(l.href)) || pathname.startsWith("/admin");

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    setMoreOpen(false);
    setOpen(false);
  }, [pathname]);

  return (
    <header className="site-header sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--header)] backdrop-blur-md">
      <div className="shell flex items-center gap-3 py-2">
        <Link href="/" className="brand-mark text-lg shrink-0" onClick={() => setOpen(false)}>
          stump<span className="text-[var(--accent)]">chess</span>
        </Link>

        <nav className="hidden lg:flex items-center gap-0.5 ui text-sm flex-1 min-w-0">
          {PRIMARY.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`nav-link ${pathname.startsWith(l.href) ? "active" : "muted"}`}
            >
              {l.label}
            </Link>
          ))}

          <div className="nav-more" ref={moreRef}>
            <button
              type="button"
              className={`nav-link ${moreActive || moreOpen ? "active" : "muted"}`}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              More
            </button>
            {moreOpen && (
              <div className="nav-more-menu panel">
                {MORE.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`nav-more-item ${pathname.startsWith(l.href) ? "active" : ""}`}
                    onClick={() => setMoreOpen(false)}
                  >
                    {l.label}
                  </Link>
                ))}
                {isStaff && (
                  <Link
                    href="/admin"
                    className={`nav-more-item ${pathname.startsWith("/admin") ? "active" : ""}`}
                    onClick={() => setMoreOpen(false)}
                  >
                    Admin
                  </Link>
                )}
              </div>
            )}
          </div>
        </nav>

        <div className="hidden lg:flex items-center gap-1 ui text-sm shrink-0 ml-auto">
          {user ? (
            <>
              <Link
                href={`/u/${user.username || user.name}`}
                className="nav-user"
                title={user.username || user.name}
              >
                <span className="nav-user-name">{user.username || user.name}</span>
                {user.role && user.role !== "MEMBER" && <RoleBadge role={user.role} />}
              </Link>
              <button type="button" className="btn btn-ghost !py-1 !px-2 !text-xs" onClick={() => signOut()}>
                Out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="nav-link muted">
                Login
              </Link>
              <Link href="/register" className="btn btn-accent !py-1 !px-2.5 !text-xs">
                Join
              </Link>
            </>
          )}
          <button
            type="button"
            className="btn btn-ghost !py-1 !px-2 !text-xs"
            onClick={toggle}
            aria-label="Toggle theme"
            title={theme === "light" ? "Dark mode" : "Light mode"}
          >
            {theme === "light" ? "Dark" : "Light"}
          </button>
        </div>

        <div className="flex lg:hidden items-center gap-2 ml-auto">
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
        <div className="lg:hidden border-t border-[var(--line)] bg-[var(--panel)] ui text-sm">
          <div className="shell py-2 flex flex-col">
            {[...PRIMARY, ...MORE].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`py-2.5 border-b border-[var(--line)] ${
                  pathname.startsWith(l.href) ? "text-[var(--accent)] font-semibold" : ""
                }`}
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
