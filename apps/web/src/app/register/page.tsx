"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "");
    const password = String(fd.get("password") || "");
    const username = String(fd.get("username") || "").trim();
    const name = username;

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setError("Username: 3–20 letters, numbers, underscore");
      setLoading(false);
      return;
    }
    if (username.toLowerCase() === "jojo") {
      setError("Username reserved");
      setLoading(false);
      return;
    }

    const res = await signUp.email({
      email,
      password,
      name,
      username,
    } as Parameters<typeof signUp.email>[0] & { username: string });

    setLoading(false);
    if (res.error) {
      setError(res.error.message || "Registration failed");
      return;
    }
    router.push("/play");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md panel p-6 rise">
      <h1 className="text-3xl mb-2">Register</h1>
      <p className="text-[var(--muted)] mb-6 font-[family-name:var(--font-mono)] text-sm">
        Simple account. You start as Member.
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className="input" name="username" placeholder="Username" required minLength={3} />
        <input className="input" name="email" type="email" placeholder="Email" required />
        <input
          className="input"
          name="password"
          type="password"
          placeholder="Password (8+)"
          required
          minLength={8}
        />
        {error && <p className="text-[var(--danger)] text-sm">{error}</p>}
        <button className="btn btn-accent w-full" disabled={loading}>
          {loading ? "…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-[var(--muted)]">
        Have an account? <Link href="/login" className="underline">Login</Link>
      </p>
    </div>
  );
}
