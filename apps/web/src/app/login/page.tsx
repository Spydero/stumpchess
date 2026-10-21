"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
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
    const res = await signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message || "Login failed");
      return;
    }
    router.push("/play");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md panel p-5 sm:p-6">
      <h1 className="text-3xl mb-5">Login</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className="input" name="email" type="email" placeholder="Email" required />
        <input className="input" name="password" type="password" placeholder="Password" required />
        {error && <p className="text-[var(--danger)] ui text-sm">{error}</p>}
        <button className="btn btn-accent w-full" disabled={loading}>
          {loading ? "…" : "Login"}
        </button>
      </form>
      <p className="mt-4 ui text-sm muted">
        No account? <Link href="/register" className="link-accent">Register</Link>
      </p>
    </div>
  );
}
