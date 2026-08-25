import { computeWeights } from "@/domain/computeWeights";
import type { Allocation, TargetWeight } from "@/domain/types";
import { prisma } from "@/lib/prisma";

export interface DashboardData {
  weights: TargetWeight[];
  totalContributors: number;
  totalRawCapital: number;
}

/** Recomputes weights (and summary stats) from every allocation ever persisted — always fresh, never cached. */
export async function getDashboardData(): Promise<DashboardData> {
  const rows = await prisma.allocation.findMany({
    select: { userId: true, targetId: true, amount: true },
  });

  const allocations: Allocation[] = rows.map((row) => ({
    userId: row.userId,
    targetId: row.targetId,
    amount: row.amount.toNumber(),
  }));

  return {
    weights: computeWeights(allocations),
    totalContributors: new Set(allocations.map((a) => a.userId.trim())).size,
    totalRawCapital: allocations.reduce((sum, a) => sum + a.amount, 0),
  };
}

/** Weights only — used by the API route, which doesn't need the summary stats. */
export async function getTargetWeights(): Promise<TargetWeight[]> {
  return (await getDashboardData()).weights;
}
