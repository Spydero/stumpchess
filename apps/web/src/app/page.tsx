import Link from "next/link";

export default function HomePage() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] items-center min-h-[70vh]">
      <section className="rise">
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.2em] text-[var(--muted)] mb-4">
          lightweight · modern · stump-rooted
        </p>
        <h1 className="text-5xl md:text-7xl leading-[0.95] tracking-tight mb-5">
          stump<span className="text-[var(--accent)]">chess</span>
        </h1>
        <p className="max-w-md text-lg text-[var(--muted)] mb-8">
          Challenge the queue, talk in a classic forum, and — if you&apos;re VIP — run full engine
          analysis on your machine.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/play" className="btn btn-accent">
            Play now
          </Link>
          <Link href="/forum" className="btn btn-ghost">
            Enter forum
          </Link>
        </div>
      </section>

      <section
        className="panel rise relative overflow-hidden p-6 min-h-[320px] flex flex-col justify-end"
        style={{ animationDelay: "120ms" }}
      >
        <div
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              "linear-gradient(45deg, var(--board-dark) 25%, transparent 25%), linear-gradient(-45deg, var(--board-dark) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--board-dark) 75%), linear-gradient(-45deg, transparent 75%, var(--board-dark) 75%)",
            backgroundSize: "64px 64px",
            backgroundPosition: "0 0, 0 32px, 32px -32px, -32px 0",
            backgroundColor: "var(--board-light)",
          }}
        />
        <div className="relative z-10 bg-[rgba(28,25,20,0.82)] text-[var(--accent-ink)] p-4">
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest mb-2">
            Owner
          </p>
          <p className="text-2xl">jOjo</p>
          <p className="text-sm opacity-80 mt-1">Tree stump. No public stats. Just games.</p>
        </div>
      </section>
    </div>
  );
}
