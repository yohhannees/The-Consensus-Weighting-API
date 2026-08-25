import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  await prisma.allocation.deleteMany();

  const concentrated = [{ userId: "user_1", targetId: "A", amount: 10_000 }];

  const distributed = Array.from({ length: 100 }, (_, i) => ({
    userId: `user_${i}`,
    targetId: "B",
    amount: 100,
  }));

  await prisma.allocation.createMany({ data: [...concentrated, ...distributed] });

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
