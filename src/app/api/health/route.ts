import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiStatus } from "@/lib/ai/providers";

/**
 * Health check for Render.
 *
 * Checks the database too, not just that the process is up. A web service that
 * answers 200 while its database is unreachable is worse than one that fails,
 * because the load balancer keeps sending it traffic.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    const [employees, brands, rosters] = await Promise.all([
      db.employee.count(),
      db.brand.count(),
      db.roster.count(),
    ]);

    return NextResponse.json({
      status: "ok",
      database: "connected",
      latencyMs: Date.now() - startedAt,
      counts: { employees, brands, rosters },
      seeded: employees > 0,
      ai: aiStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        database: "unreachable",
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
