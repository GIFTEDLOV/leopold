import { NextResponse } from "next/server";

import { probeRouteEnabled } from "@/lib/sg5/protocol";

export function GET() {
  if (!probeRouteEnabled(process.env.NODE_ENV, process.env.SG5_PROBE_PAGE, process.env.SG5_PROBE_PRODUCTION)) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json({
    status: "SG5_PROBE_READY",
    mode: process.env.SG5_LIVE_ACK ? "LIVE_SEPOLIA" : "STRUCTURAL",
  });
}
