"use client";

import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useBoardTheme } from "@/components/BoardThemeProvider";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { boardTheme, setBoardThemeId, themes } = useBoardTheme();

  return (
    <div className="rise-in max-w-2xl">
      <header className="page-hero mb-6">
        <p className="forum-kicker">Account</p>
        <h1 className="text-3xl sm:text-4xl mt-1 mb-2">Settings</h1>
        <p className="muted ui text-base m-0">Site look and board colors. Saved on this device.</p>
      </header>

      <section className="panel p-5 mb-4">
        <h2 className="text-xl mt-0 mb-3">Site theme</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`btn ${theme === "light" ? "btn-accent" : "btn-ghost"}`}
            onClick={() => setTheme("light")}
          >
            Light
          </button>
          <button
            type="button"
            className={`btn ${theme === "dark" ? "btn-accent" : "btn-ghost"}`}
            onClick={() => setTheme("dark")}
          >
            Dark
          </button>
        </div>
      </section>

      <section className="panel p-5 mb-4">
        <h2 className="text-xl mt-0 mb-1">Board theme</h2>
        <p className="ui text-sm muted mt-0 mb-4">
          Applies to Play, Watch, Practice, Openings, and Analysis.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {themes.map((t) => {
            const active = t.id === boardTheme.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`board-theme-card ${active ? "active" : ""}`}
                onClick={() => setBoardThemeId(t.id)}
              >
                <span
                  className="board-theme-preview"
                  style={{
                    background: `
                      linear-gradient(45deg, ${t.light} 25%, ${t.dark} 25%, ${t.dark} 50%, ${t.light} 50%, ${t.light} 75%, ${t.dark} 75%)
                    `,
                    backgroundSize: "24px 24px",
                  }}
                  aria-hidden
                />
                <span className="ui text-sm font-semibold">{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 max-w-[220px] mx-auto border border-[var(--line)] rounded-sm overflow-hidden">
          <div
            className="aspect-square grid"
            style={{ gridTemplateColumns: "repeat(8, 1fr)", gridTemplateRows: "repeat(8, 1fr)" }}
            aria-hidden
          >
            {Array.from({ length: 64 }, (_, i) => {
              const row = Math.floor(i / 8);
              const col = i % 8;
              const dark = (row + col) % 2 === 1;
              return (
                <div
                  key={i}
                  style={{ background: dark ? boardTheme.dark : boardTheme.light }}
                />
              );
            })}
          </div>
        </div>
      </section>

      <p className="ui text-sm muted">
        <Link href="/messages" className="link-accent">
          Messages
        </Link>
        {" · "}
        <Link href="/watch" className="link-accent">
          Watch live
        </Link>
      </p>
    </div>
  );
}
