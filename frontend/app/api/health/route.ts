import { NextResponse } from "next/server";

import { getPublicHealth } from "@/lib/ops/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getPublicHealth();
  return NextResponse.json(health, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
