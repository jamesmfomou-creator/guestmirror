import { NextRequest, NextResponse } from "next/server";

/**
 * Gates /admin/* behind HTTP Basic Auth. Deliberately minimal -- this is a
 * single-operator internal dashboard, not a multi-user auth system.
 */
export function proxy(req: NextRequest) {
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

export const config = {
  matcher: "/admin/:path*",
};
