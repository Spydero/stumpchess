export type Role =
  | "MEMBER"
  | "VIP_30"
  | "VIP_PERM"
  | "STA"
  | "LTA"
  | "MANAGER"
  | "OWNER";

export const ROLE_RANK: Record<Role, number> = {
  MEMBER: 0,
  VIP_30: 1,
  VIP_PERM: 2,
  STA: 3,
  LTA: 4,
  MANAGER: 5,
  OWNER: 6,
};

export const ROLE_LABEL: Record<Role, string> = {
  MEMBER: "Member",
  VIP_30: "VIP (30 days)",
  VIP_PERM: "VIP (Permanent)",
  STA: "Short Term Admin",
  LTA: "Long Term Admin",
  MANAGER: "Manager",
  OWNER: "Owner",
};

/** Fallback role hues (UI prefers theme-aware `.role-*` CSS). */
export const ROLE_COLOR: Record<Role, string> = {
  MEMBER: "#8a8074",
  VIP_30: "#d4a017",
  VIP_PERM: "#e0b84a",
  STA: "#e05a4a",
  LTA: "#4aa3e8",
  MANAGER: "#c084fc",
  OWNER: "#e8c547",
};

export const OWNER_USERNAME = "jOjo";

export const TIME_CONTROLS = [
  { id: "3+0", initialMs: 180_000, incrementMs: 0, label: "3+0", kind: "bullet" as const },
  { id: "5+0", initialMs: 300_000, incrementMs: 0, label: "5+0", kind: "blitz" as const },
  { id: "10+0", initialMs: 600_000, incrementMs: 0, label: "10+0", kind: "rapid" as const },
] as const;

export type TimeControlId = (typeof TIME_CONTROLS)[number]["id"];

/** Practice / coach clocks (includes increment + unlimited). */
export const PRACTICE_TIME_CONTROLS = [
  { id: "unlimited", initialMs: 0, incrementMs: 0, label: "∞" },
  { id: "1+0", initialMs: 60_000, incrementMs: 0, label: "1+0" },
  { id: "3+0", initialMs: 180_000, incrementMs: 0, label: "3+0" },
  { id: "3+2", initialMs: 180_000, incrementMs: 2_000, label: "3+2" },
  { id: "5+0", initialMs: 300_000, incrementMs: 0, label: "5+0" },
  { id: "5+3", initialMs: 300_000, incrementMs: 3_000, label: "5+3" },
  { id: "10+0", initialMs: 600_000, incrementMs: 0, label: "10+0" },
  { id: "15+10", initialMs: 900_000, incrementMs: 10_000, label: "15+10" },
] as const;

export type PracticeTimeControlId = (typeof PRACTICE_TIME_CONTROLS)[number]["id"];

export function practiceTcById(id: string) {
  return PRACTICE_TIME_CONTROLS.find((t) => t.id === id) || PRACTICE_TIME_CONTROLS[4];
}

/** Stockfish Skill Level → approximate Elo (community-calibrated). */
export const BOT_PRESETS = [
  { skill: 0, elo: 800, label: "Beginner" },
  { skill: 2, elo: 1100, label: "Casual" },
  { skill: 4, elo: 1400, label: "Club" },
  { skill: 6, elo: 1600, label: "Intermediate" },
  { skill: 8, elo: 1800, label: "Advanced" },
  { skill: 10, elo: 2000, label: "Expert" },
  { skill: 12, elo: 2200, label: "Master" },
  { skill: 15, elo: 2500, label: "GM" },
  { skill: 18, elo: 2800, label: "Super-GM" },
  { skill: 20, elo: 3000, label: "Max" },
] as const;

export type BotPreset = (typeof BOT_PRESETS)[number];

/**
 * Two bot lanes (kept separate on purpose):
 * - Personality: UCI_Elo capped + light style spice
 * - Engine (Stockfish): best move only; Elo settable (or Max = unlimited)
 */
export type BotStyle = "balanced" | "aggressive" | "solid" | "tricky";

/** Stockfish UCI_LimitStrength range (SF19 lite). */
export const ENGINE_ELO_MIN = 800;
export const ENGINE_ELO_MAX = 2850;
/** Sentinel / botLevel marker: unlimited Stockfish. */
export const ENGINE_ELO_FULL = 0;

export const STOCKFISH_BOT = {
  id: "stockfish",
  kind: "engine" as const,
  name: "Stockfish",
  tagline: "Best move only. Set Elo or Max.",
  skill: 20,
  elo: ENGINE_ELO_FULL,
} as const;

export type EngineBot = typeof STOCKFISH_BOT;

export function clampEngineElo(elo: number): number {
  if (!Number.isFinite(elo) || elo <= 0 || elo > ENGINE_ELO_MAX) return ENGINE_ELO_FULL;
  return Math.max(ENGINE_ELO_MIN, Math.min(ENGINE_ELO_MAX, Math.round(elo / 50) * 50));
}

export function isEngineFullStrength(elo: number): boolean {
  return elo <= 0 || elo > ENGINE_ELO_MAX;
}

export function formatEngineElo(elo: number): string {
  return isEngineFullStrength(elo) ? "Max" : `${clampEngineElo(elo)}`;
}

/**
 * botLevel encoding for /api/games/bot:
 * - 0..18 → personality skill
 * - 20 or 0-sentinel via 3200 → full Stockfish
 * - 800..2850 → Stockfish at that Elo
 */
export function encodeBotLevel(opts: { kind: "personality"; skill: number } | { kind: "engine"; elo: number }): number {
  if (opts.kind === "personality") return Math.max(0, Math.min(18, opts.skill));
  const elo = clampEngineElo(opts.elo);
  return isEngineFullStrength(elo) ? 20 : elo;
}

export const PERSONALITY_BOTS = [
  {
    id: "pebble",
    kind: "personality" as const,
    name: "Pebble",
    tagline: "Beginner",
    skill: 0,
    elo: 800,
    style: "balanced" as const,
  },
  {
    id: "maple",
    kind: "personality" as const,
    name: "Maple",
    tagline: "Solid club player",
    skill: 4,
    elo: 1400,
    style: "solid" as const,
  },
  {
    id: "spark",
    kind: "personality" as const,
    name: "Spark",
    tagline: "Aggressive",
    skill: 6,
    elo: 1600,
    style: "aggressive" as const,
  },
  {
    id: "haze",
    kind: "personality" as const,
    name: "Haze",
    tagline: "Tricky",
    skill: 8,
    elo: 1800,
    style: "tricky" as const,
  },
  {
    id: "iron",
    kind: "personality" as const,
    name: "Iron",
    tagline: "Positional",
    skill: 10,
    elo: 2000,
    style: "solid" as const,
  },
  {
    id: "blade",
    kind: "personality" as const,
    name: "Blade",
    tagline: "Attacking",
    skill: 12,
    elo: 2200,
    style: "aggressive" as const,
  },
  {
    id: "mirage",
    kind: "personality" as const,
    name: "Mirage",
    tagline: "Tactical",
    skill: 15,
    elo: 2500,
    style: "tricky" as const,
  },
  {
    id: "oracle",
    kind: "personality" as const,
    name: "Oracle",
    tagline: "Master strength",
    skill: 18,
    elo: 2800,
    style: "solid" as const,
  },
] as const;

export type PersonalityBot = (typeof PERSONALITY_BOTS)[number];
export type PlayableBot = PersonalityBot | EngineBot;

export function isEngineBot(bot: PlayableBot): bot is EngineBot {
  return bot.kind === "engine";
}

export function personalityBotById(id: string): PersonalityBot {
  return PERSONALITY_BOTS.find((b) => b.id === id) || PERSONALITY_BOTS[3];
}

export function playableBotById(id: string): PlayableBot {
  if (id === STOCKFISH_BOT.id) return STOCKFISH_BOT;
  return personalityBotById(id);
}

export function botPresetBySkill(skill: number): BotPreset {
  const exact = BOT_PRESETS.find((b) => b.skill === skill);
  if (exact) return exact;
  let best: BotPreset = BOT_PRESETS[0];
  for (const b of BOT_PRESETS) {
    if (Math.abs(b.skill - skill) < Math.abs(best.skill - skill)) best = b;
  }
  return best;
}

export function botEloFromSkill(skill: number): number {
  return botPresetBySkill(skill).elo;
}

export function decodeBotLevel(level: number): {
  kind: "personality" | "engine";
  skill: number;
  elo: number;
} {
  if (level >= ENGINE_ELO_MIN && level <= ENGINE_ELO_MAX) {
    return { kind: "engine", skill: 20, elo: level };
  }
  if (level >= 20) {
    return { kind: "engine", skill: 20, elo: ENGINE_ELO_FULL };
  }
  const skill = Math.max(0, Math.min(18, level));
  return { kind: "personality", skill, elo: botEloFromSkill(skill) };
}

/** Personality bots: human-ish pace under UCI_Elo. */
export function personalityThinkMs(opts: {
  skill: number;
  initialMs: number;
}): { movetime: number; minDelay: number } {
  const elo = botEloFromSkill(opts.skill);
  const minutes = opts.initialMs / 60_000;
  const base =
    minutes <= 1 ? 800 : minutes <= 3 ? 1600 : minutes <= 5 ? 2800 : minutes <= 10 ? 4200 : 6000;
  const strengthBonus = Math.round(
    ((elo - 800) / 2200) * (minutes <= 1 ? 700 : minutes <= 3 ? 1400 : minutes <= 5 ? 2800 : 5000)
  );
  const movetime = Math.min(14_000, Math.max(600, base + strengthBonus));
  const minDelay = Math.min(
    movetime,
    minutes <= 1 ? 700 : minutes <= 3 ? 1300 : minutes <= 5 ? 2200 : minutes <= 10 ? 3000 : 4000
  );
  return { movetime, minDelay };
}

/** Stockfish lane: scales with TC + Elo (Max thinks longest). */
export function engineThinkMs(opts: {
  initialMs: number;
  elo?: number;
}): { movetime: number; minDelay: number } {
  const minutes = opts.initialMs / 60_000;
  const full = isEngineFullStrength(opts.elo ?? ENGINE_ELO_FULL);
  const elo = full ? ENGINE_ELO_MAX : clampEngineElo(opts.elo ?? ENGINE_ELO_MAX);
  const base =
    minutes <= 1 ? 1200 : minutes <= 3 ? 2800 : minutes <= 5 ? 4500 : minutes <= 10 ? 7000 : 10_000;
  const strengthBonus = full
    ? minutes <= 3
      ? 1200
      : 2500
    : Math.round(((elo - ENGINE_ELO_MIN) / (ENGINE_ELO_MAX - ENGINE_ELO_MIN)) * (minutes <= 3 ? 1000 : 2200));
  const movetime = Math.min(20_000, Math.max(700, base + strengthBonus));
  const minDelay = Math.min(
    movetime,
    minutes <= 1 ? 800 : minutes <= 3 ? 1400 : minutes <= 5 ? 2200 : 3000
  );
  return { movetime, minDelay };
}

/** @deprecated Prefer personalityThinkMs / engineThinkMs. */
export function botThinkMs(opts: {
  skill: number;
  initialMs: number;
  engine?: boolean;
}): { movetime: number; minDelay: number } {
  if (opts.engine || opts.skill >= 20) return engineThinkMs({ initialMs: opts.initialMs });
  return personalityThinkMs({ skill: opts.skill, initialMs: opts.initialMs });
}

export function hasVipAccess(role: Role, vipExpiresAt: Date | string | null | undefined): boolean {
  if (role === "VIP_PERM" || ROLE_RANK[role] >= ROLE_RANK.LTA) return true;
  if (role === "VIP_30" && vipExpiresAt) {
    return new Date(vipExpiresAt).getTime() > Date.now();
  }
  return false;
}

export function canAssignRoles(actor: Role): boolean {
  return ROLE_RANK[actor] >= ROLE_RANK.LTA;
}

export function canModerateForum(actor: Role): boolean {
  return ROLE_RANK[actor] >= ROLE_RANK.STA;
}

export function canManageSite(actor: Role): boolean {
  return ROLE_RANK[actor] >= ROLE_RANK.MANAGER;
}

export function isStaff(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.STA;
}

export type MovePayload = {
  gameId: string;
  from: string;
  to: string;
  promotion?: string;
  san: string;
  fen: string;
  movedAt: number;
  whiteTimeMs: number;
  blackTimeMs: number;
};

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";
