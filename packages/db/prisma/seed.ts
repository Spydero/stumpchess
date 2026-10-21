import { PrismaClient, Role } from "@prisma/client";
import { OWNER_USERNAME } from "@chess/shared";

/**
 * Owner must be created via Better Auth signup so the password hash matches.
 * This seed only ensures forum categories + site settings, and promotes an
 * existing jojo@ account to Owner if present.
 */
const prisma = new PrismaClient();

async function main() {
  const email = process.env.OWNER_EMAIL ?? "jojo@local.dev";

  await prisma.siteSetting.upsert({
    where: { id: "site" },
    update: {},
    create: { id: "site", registrationOpen: true },
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

  const owner = await prisma.user.findFirst({
    where: { OR: [{ email }, { username: { equals: OWNER_USERNAME } }, { username: "jojo" }] },
  });

  if (owner) {
    await prisma.user.update({
      where: { id: owner.id },
      data: {
        username: OWNER_USERNAME,
        displayUsername: OWNER_USERNAME,
        name: "jOjo",
        role: Role.OWNER,
        image: "/avatars/tree-stump.svg",
        emailVerified: true,
      },
    });
    console.log("Promoted Owner:", OWNER_USERNAME, email);
  } else {
    console.log("No owner user yet. Register once with:");
    console.log(`  email=${email} username=jOjo password=${process.env.OWNER_PASSWORD ?? "OwnerChangeMe123!"}`);
    console.log("Then re-run: pnpm db:seed");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
