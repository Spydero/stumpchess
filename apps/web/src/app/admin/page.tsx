"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { RoleBadge } from "@/components/RoleBadge";
import type { Role } from "@chess/shared";

type AdminUser = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  vipExpiresAt?: string | null;
  staExpiresAt?: string | null;
  banned: boolean;
};

const ROLE_OPTIONS: Role[] = ["MEMBER", "VIP_30", "VIP_PERM", "STA", "LTA", "MANAGER"];

export default function AdminPage() {
  const { data, isPending } = useSession();
  const user = data?.user as { id: string; role?: string } | undefined;
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const canAccess =
    user?.role === "STA" ||
    user?.role === "LTA" ||
    user?.role === "MANAGER" ||
    user?.role === "OWNER";

  function load() {
    if (!user) return;
    apiFetch("/api/admin/users", { userId: user.id })
      .then(setUsers)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (user && canAccess) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  async function assignRole(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/admin/roles", {
        method: "POST",
        userId: user.id,
        body: JSON.stringify({
          username: fd.get("username"),
          role: fd.get("role"),
        }),
      });
      setMsg("Role updated");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (isPending) return <p className="pulse-soft">Loading…</p>;
  if (!user) return <p>Login required.</p>;
  if (!canAccess) return <p className="text-[var(--danger)]">Staff only.</p>;

  const canAssign = user.role === "LTA" || user.role === "MANAGER" || user.role === "OWNER";

  return (
    <div className="rise space-y-6">
      <div>
        <h1 className="text-3xl mb-1">Admin</h1>
        <p className="text-sm text-[var(--muted)] font-[family-name:var(--font-mono)]">
          Your role: {user.role}
        </p>
      </div>

      {canAssign && (
        <form onSubmit={assignRole} className="panel p-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input className="input" name="username" placeholder="Username" required />
          <select className="input" name="role" defaultValue="VIP_30">
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button className="btn btn-accent">Assign</button>
        </form>
      )}

      {msg && <p className="text-[var(--accent)] text-sm">{msg}</p>}
      {error && <p className="text-[var(--danger)] text-sm">{error}</p>}

      <div className="panel divide-y divide-[var(--line)]">
        {users.map((u) => (
          <div key={u.id} className="p-3 flex flex-wrap items-center gap-3 justify-between">
            <div>
              <p className="flex items-center gap-2">
                <strong>{u.username}</strong>
                <RoleBadge role={u.role} />
                {u.banned && <span className="text-[var(--danger)] text-xs">banned</span>}
              </p>
              <p className="text-xs text-[var(--muted)] font-[family-name:var(--font-mono)]">
                {u.email}
                {u.vipExpiresAt ? ` · VIP until ${new Date(u.vipExpiresAt).toLocaleDateString()}` : ""}
                {u.staExpiresAt ? ` · STA until ${new Date(u.staExpiresAt).toLocaleDateString()}` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
