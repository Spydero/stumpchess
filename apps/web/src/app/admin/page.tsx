"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { RoleBadge } from "@/components/RoleBadge";
import { roleLabel } from "@/lib/roles";
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

const ROLE_OPTIONS: Role[] = [
  "MEMBER",
  "TOURNAMENT_HOST",
  "VIP_30",
  "VIP_PERM",
  "STA",
  "LTA",
  "MANAGER",
];

export default function AdminPage() {
  const { data, isPending } = useSession();
  const user = data?.user as { id: string; role?: string } | undefined;
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [vipFeaturesOpen, setVipFeaturesOpen] = useState<boolean | null>(null);
  const [savingVip, setSavingVip] = useState(false);

  const canAccess =
    user?.role === "STA" ||
    user?.role === "LTA" ||
    user?.role === "MANAGER" ||
    user?.role === "OWNER";

  const canAssign = user?.role === "LTA" || user?.role === "MANAGER" || user?.role === "OWNER";
  const canToggleVipFeatures = canAssign;

  function load() {
    if (!user) return;
    apiFetch("/api/admin/users", { userId: user.id })
      .then(setUsers)
      .catch((e) => setError(e.message));
  }

  function loadVipFeatures() {
    if (!user || !canToggleVipFeatures) return;
    apiFetch("/api/admin/vip-features", { userId: user.id })
      .then((s: { vipFeaturesOpen: boolean }) => setVipFeaturesOpen(Boolean(s.vipFeaturesOpen)))
      .catch(() => setVipFeaturesOpen(null));
  }

  useEffect(() => {
    if (user && canAccess) load();
    if (user && canToggleVipFeatures) loadVipFeatures();
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
      setError("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function setVipOpen(open: boolean) {
    if (!user || !canToggleVipFeatures) return;
    setSavingVip(true);
    setError("");
    try {
      const s = await apiFetch("/api/admin/vip-features", {
        method: "POST",
        userId: user.id,
        body: JSON.stringify({ open }),
      });
      setVipFeaturesOpen(Boolean(s.vipFeaturesOpen));
      setMsg(
        open
          ? "Analysis and Practice are open to all members."
          : "Analysis and Practice are VIP-only."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update site setting");
    } finally {
      setSavingVip(false);
    }
  }

  if (isPending) return <p className="pulse-soft">Loading…</p>;
  if (!user) return <p>Login required.</p>;
  if (!canAccess) return <p className="text-[var(--danger)]">Staff only.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl mb-1">Admin</h1>
        <p className="ui text-sm muted m-0">Role: {user.role}</p>
        <p className="ui text-sm muted mt-2 mb-0 max-w-xl">
          Assign VIP for Practice/analysis, or <strong>Tournament Host</strong> to run events.
          Role changes need LTA or above.
        </p>
      </div>

      {canToggleVipFeatures && (
        <div className="panel p-4 space-y-3">
          <p className="forum-kicker m-0">Site features</p>
          <h2 className="text-xl m-0">Analysis &amp; Practice access</h2>
          <p className="ui text-sm muted m-0 max-w-xl">
            When open, every member can use Review, Practice, and mistake drills. Turn it off to
            require VIP (or higher).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`btn ${vipFeaturesOpen === true ? "btn-accent" : "btn-ghost"}`}
              disabled={savingVip || vipFeaturesOpen === null}
              onClick={() => setVipOpen(true)}
            >
              Open to all members
            </button>
            <button
              type="button"
              className={`btn ${vipFeaturesOpen === false ? "btn-accent" : "btn-ghost"}`}
              disabled={savingVip || vipFeaturesOpen === null}
              onClick={() => setVipOpen(false)}
            >
              VIP only
            </button>
            {vipFeaturesOpen !== null && (
              <span className="ui text-xs muted">
                Current: {vipFeaturesOpen ? "open to all" : "VIP only"}
                {savingVip ? " · saving…" : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {canAssign && (
        <form onSubmit={assignRole} className="panel p-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input className="input" name="username" placeholder="Username" required />
          <select className="input" name="role" defaultValue="VIP_30">
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
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
