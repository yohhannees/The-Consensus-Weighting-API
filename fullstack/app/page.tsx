import { getDashboardData } from "@/lib/getTargetWeights";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

/**
 * Server Component: the first paint is real data straight from Prisma (no loading
 * flash, and the ranking is in the HTML). Everything interactive lives in
 * <Dashboard />, which takes this over as its starting state and then keeps itself
 * in sync from the API responses it makes.
 */
export default async function DashboardPage() {
  return <Dashboard initial={await getDashboardData()} />;
}
