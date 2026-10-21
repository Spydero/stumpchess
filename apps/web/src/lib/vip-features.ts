"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { userHasVip } from "@/lib/roles";

export type VipFeatureAccess = {
  loading: boolean;
  /** Personal VIP / LTA+ hierarchy. */
  personalVip: boolean;
  /** Site flag: analysis & Practice open to all members. */
  openToAll: boolean;
  /** May use analysis / Practice / mistake drills. */
  allowed: boolean;
};

/**
 * Resolves whether the current user can use VIP analysis features.
 * Honors the LTA+ site toggle (open to all by default).
 */
export function useVipFeatures(user?: {
  id: string;
  role?: string;
  vipExpiresAt?: string | Date | null;
} | null): VipFeatureAccess {
  const personalVip = user
    ? userHasVip(user.role || "MEMBER", user.vipExpiresAt)
    : false;
  const [openToAll, setOpenToAll] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.id) {
        try {
          const site = await apiFetch("/api/site");
          if (!cancelled) {
            setOpenToAll(Boolean(site.vipFeaturesOpen));
            setAllowed(false);
          }
        } catch {
          if (!cancelled) {
            setOpenToAll(true);
            setAllowed(false);
          }
        }
        return;
      }

      if (personalVip) {
        try {
          const site = await apiFetch("/api/site");
          if (!cancelled) {
            setOpenToAll(Boolean(site.vipFeaturesOpen));
            setAllowed(true);
          }
        } catch {
          if (!cancelled) {
            setOpenToAll(true);
            setAllowed(true);
          }
        }
        return;
      }

      try {
        const me = await apiFetch("/api/me/vip", { userId: user.id });
        if (!cancelled) {
          setOpenToAll(Boolean(me.vipFeaturesOpen));
          setAllowed(Boolean(me.allowed));
        }
      } catch {
        try {
          const site = await apiFetch("/api/site");
          if (!cancelled) {
            const open = Boolean(site.vipFeaturesOpen);
            setOpenToAll(open);
            setAllowed(open);
          }
        } catch {
          if (!cancelled) {
            setOpenToAll(true);
            setAllowed(true);
          }
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, user?.vipExpiresAt, personalVip]);

  return {
    loading: allowed === null,
    personalVip,
    openToAll,
    allowed: allowed === true,
  };
}
