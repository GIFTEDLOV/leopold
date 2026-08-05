import { NextResponse } from "next/server";

import { probeRouteEnabled } from "@/lib/sg5/protocol";

export function GET() {
  if (!probeRouteEnabled(process.env.NODE_ENV, process.env.SG5_PROBE_PAGE)) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json({ status: "LOCAL_SG5_FIXTURE_READY" });
}
