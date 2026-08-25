import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl = process.env.DATABASE_URL;

/**
 * Seeding is destructive (it replaces the entire Allocation table with the demo
 * scenario), so refuse to run against anything that isn't a local database
 * unless the caller explicitly opts in with SEED_FORCE=1. Without this guard,
 * an .env pointing at a shared/remote database would let a casual
 * `npm run db:seed`  -  or the e2e suite, which reseeds automatically  -  wipe it.
 */
function assertSafeTarget(url: string): void {
  const host = new URL(url).hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLocal && process.env.SEED_FORCE !== "1") {
    throw new Error(
      `Refusing to seed non-local database host "${host}"  -  seeding deletes every allocation. ` +
        `Set SEED_FORCE=1 to override if you really mean it.`,
    );
  }
}

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}
assertSafeTarget(databaseUrl);

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const concentrated = [{ userId: "user_1", targetId: "A", amount: 10_000 }];

  const distributed = Array.from({ length: 100 }, (_, i) => ({
    userId: `user_${i}`,
    targetId: "B",
    amount: 100,
  }));

  // One transaction: a concurrent reader never observes the half-reset state
  // (empty table, or old ProcessedRequest keys against new data). Clearing
  // ProcessedRequest matters too  -  stale idempotency keys from before a reset
  // would otherwise silently no-op re-submissions of the demo scenario.
  await prisma.$transaction([
    prisma.allocation.deleteMany(),
    prisma.processedRequest.deleteMany(),
    prisma.allocation.createMany({ data: [...concentrated, ...distributed] }),
  ]);

  console.log(
    `Seeded ${concentrated.length + distributed.length} allocations: ` +
      `Target A (1 user, $10,000) vs Target B (100 users, $100 each).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
