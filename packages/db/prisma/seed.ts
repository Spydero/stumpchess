import { randomBytes } from "crypto";
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { OWNER_USERNAME } from "@chess/shared";

/**
 * Ensures forum categories, site settings, and an Owner account in Postgres.
 *
 * Owner can be created entirely from the database (no web signup required):
 *   pnpm db:seed
 *
 * Env:
 *   OWNER_EMAIL / OWNER_PASSWORD / OWNER_USERNAME (optional)
 *   OWNER_RESET_PASSWORD=1  → rewrite credential password on seed (recovery)
 */
const prisma = new PrismaClient();

function newId() {
  return randomBytes(24).toString("base64url");
}

async function findOwnerCandidate(email: string, username: string) {
  const byEmail = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (byEmail) return byEmail;

  const byUsername = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  });
  if (byUsername) return byUsername;

  // Legacy default username only when seeding the default Owner identity
  if (username === OWNER_USERNAME) {
    return prisma.user.findFirst({
      where: { username: { equals: "jojo", mode: "insensitive" } },
    });
  }
  return null;
}

async function ensureCredential(userId: string, password: string, forceReset: boolean) {
  const credential = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
  });
  const hashed = await hashPassword(password);

  if (!credential) {
    await prisma.account.create({
      data: {
        id: newId(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashed,
      },
    });
    console.log("Attached credential login for Owner.");
    console.log(`  Login password: ${password}`);
    return;
  }

  if (forceReset || !credential.password) {
    await prisma.account.update({
      where: { id: credential.id },
      data: { password: hashed },
    });
    console.log(
      forceReset
        ? `Owner password reset (OWNER_RESET_PASSWORD=1): ${password}`
        : `Owner password set (was empty): ${password}`
    );
  }
}

async function main() {
  const email = (process.env.OWNER_EMAIL ?? "jojo@local.dev").trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD ?? "OwnerChangeMe123!";
  const username = (process.env.OWNER_USERNAME ?? OWNER_USERNAME).trim() || OWNER_USERNAME;
  const resetPassword = process.env.OWNER_RESET_PASSWORD === "1";

  await prisma.siteSetting.upsert({
    where: { id: "site" },
    update: {},
    create: { id: "site", registrationOpen: true, vipFeaturesOpen: true },
  });

  const categories = [
    { name: "General", slug: "general", description: "Talk about anything chess-related.", sortOrder: 0 },
    { name: "Games & Analysis", slug: "games", description: "Share games and discuss positions.", sortOrder: 1 },
    { name: "Site Feedback", slug: "feedback", description: "Bugs, ideas, and suggestions.", sortOrder: 2 },
  ];

  for (const c of categories) {
    await prisma.forumCategory.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description, sortOrder: c.sortOrder },
      create: c,
    });
  }

  let owner = await findOwnerCandidate(email, username);

  if (!owner) {
    const userId = newId();
    owner = await prisma.user.create({
      data: {
        id: userId,
        name: "jOjo",
        email,
        emailVerified: true,
        username,
        displayUsername: username,
        role: Role.OWNER,
        image: "/avatars/tree-stump.jpg",
        accounts: {
          create: {
            id: newId(),
            accountId: userId,
            providerId: "credential",
            password: await hashPassword(password),
          },
        },
      },
    });
    console.log("Created Owner in database:", username, email);
    console.log(`  Login password: ${password}`);
  } else {
    owner = await prisma.user.update({
      where: { id: owner.id },
      data: {
        email,
        username,
        displayUsername: username,
        name: owner.name || "jOjo",
        role: Role.OWNER,
        image: owner.image || "/avatars/tree-stump.jpg",
        emailVerified: true,
      },
    });
    console.log("Promoted / refreshed Owner:", username, email);
    await ensureCredential(owner.id, password, resetPassword);
  }

  console.log("");
  console.log("Owner recovery options:");
  console.log("  1) Seed create/promote:  pnpm db:seed");
  console.log("  2) Reset password:       OWNER_RESET_PASSWORD=1 pnpm db:seed");
  console.log(
    `  3) SQL promote only:      UPDATE "User" SET role = 'OWNER' WHERE email = '${email}';`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
