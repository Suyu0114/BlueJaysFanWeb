import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

// Daily ETL cron calls this after a successful upsert so ISR caches drop
// stale player data. Authenticated by a shared secret, preferred via the
// x-revalidate-secret header (URL-safe regardless of secret characters);
// the ?secret= query string is still accepted for ad-hoc curl testing.
export async function POST(req: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "REVALIDATE_SECRET not configured" },
      { status: 500 },
    );
  }

  const secret =
    req.headers.get("x-revalidate-secret") ??
    req.nextUrl.searchParams.get("secret");
  if (secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // The data set is small and a cron pass can update any player page;
  // bust the whole tree rather than enumerating routes.
  revalidatePath("/", "layout");

  return NextResponse.json({
    ok: true,
    revalidated: "/",
    at: new Date().toISOString(),
  });
}
