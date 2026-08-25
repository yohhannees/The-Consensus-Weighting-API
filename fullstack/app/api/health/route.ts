import { prisma } from "@/lib/prisma";

/** Checks actual database reachability, not just process liveness  -  mirrors backend-only's /health. */
export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error", message: "database unreachable" }, { status: 503 });
  }
}
