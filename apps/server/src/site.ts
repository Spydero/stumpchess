import { prisma } from "@chess/db";
import { hasVipAccess, type Role } from "@chess/shared";

export async function getSiteSettings() {
  return prisma.siteSetting.upsert({
    where: { id: "site" },
    update: {},
    create: {
      id: "site",
      registrationOpen: true,
      vipFeaturesOpen: true,
    },
  });
}

/** Analysis / Practice / mistake drills: open to all members, or VIP-gated. */
export async function canUseVipFeatures(
  role: Role,
  vipExpiresAt: Date | string | null | undefined
): Promise<{ personalVip: boolean; vipFeaturesOpen: boolean; allowed: boolean }> {
  const personalVip = hasVipAccess(role, vipExpiresAt);
  if (personalVip) {
    const site = await getSiteSettings();
    return { personalVip: true, vipFeaturesOpen: site.vipFeaturesOpen, allowed: true };
  }
  const site = await getSiteSettings();
  return {
    personalVip: false,
    vipFeaturesOpen: site.vipFeaturesOpen,
    allowed: site.vipFeaturesOpen,
  };
}
