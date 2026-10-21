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
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl mb-1">Admin</h1>
        <p className="ui text-sm muted m-0">Role: {user.role}</p>
        <p className="ui text-sm muted mt-2 mb-0 max-w-xl">
          Assign <strong>VIP_30</strong> (30 days) or <strong>VIP_PERM</strong> for Practice and analysis.
        </p>
      </div>

      {canAssign && (
        <form onSubmit={assignRole} className="panel p-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input className="input" name="username" placeholder="Username" required />
          <select className="input" name="role" defaultValue="VIP_30">
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r === "VIP_30" ? "VIP (30 days)" : r === "VIP_PERM" ? "VIP (Permanent)" : r}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-accent">
            Assign
          </button>
        </form>
      )}

      {msg && <p className="ui text-sm text-[var(--accent)]">{msg}</p>}
      {error && <p className="ui text-sm text-[var(--danger)]">{error}</p>}

      <div className="panel">
        {users.map((u) => (
          <div key={u.id} className="table-row">
            <div>
              <p className="m-0 flex items-center gap-2">
                <strong>{u.username}</strong>
                <RoleBadge role={u.role} />
                {u.banned && <span className="text-[var(--danger)] ui text-xs">banned</span>}
              </p>
              <p className="m-0 mt-1 ui text-xs muted">
                {u.email}
                {u.vipExpiresAt ? ` · VIP ${new Date(u.vipExpiresAt).toLocaleDateString()}` : ""}
                {u.staExpiresAt ? ` · STA ${new Date(u.staExpiresAt).toLocaleDateString()}` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
