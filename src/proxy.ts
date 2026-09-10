import { NextRequest, NextResponse } from "next/server";
import { AB_COOKIE_NAME } from "@/lib/ab";

/**
 * Gates /admin/* behind HTTP Basic Auth. Deliberately minimal -- this is a
 * single-operator internal dashboard, not a multi-user auth system.
 */
function adminAuth(req: NextRequest): NextResponse {
  const user = process.env.ADMIN_USERNAME;
  const pass = process.env.ADMIN_PASSWORD;

  if (!user || !pass) {
    return new NextResponse("Dashboard admin non configuré.", { status: 503 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice(6));
    const separatorIndex = decoded.indexOf(":");
    const suppliedUser = decoded.slice(0, separatorIndex);
    const suppliedPass = decoded.slice(separatorIndex + 1);
    if (suppliedUser === user && suppliedPass === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentification requise.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="GuestMirror Admin"' },
  });
}

/**
 * Assigns the "Aha moment" A/B test variant (see lib/ab.ts) on first visit
 * so it's available server-side from the very first render of
 * /result/[id] -- no flash, no client/server mismatch. A no-op once the
 * cookie already exists.
 */
function assignAbVariant(req: NextRequest): NextResponse {
  const existing = req.cookies.get(AB_COOKIE_NAME)?.value;
  if (existing === "A" || existing === "B") {
    return NextResponse.next();
  }

  const variant = Math.random() < 0.5 ? "A" : "B";
  const res = NextResponse.next();
  res.cookies.set(AB_COOKIE_NAME, variant, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
  return res;
}

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/admin")) {
    return adminAuth(req);
  }
  return assignAbVariant(req);
}

export const config = {
  // /admin/* for the Basic Auth gate; everything else except API routes
  // and static assets for the A/B cookie assignment.
  matcher: ["/admin/:path*", "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
