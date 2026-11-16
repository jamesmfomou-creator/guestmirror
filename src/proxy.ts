import { NextRequest, NextResponse } from "next/server";
import { AB_COOKIE_NAME } from "@/lib/ab";
import { PAYWALL_COOKIE_NAME, drawPaywallVariant, isPaywallVariant } from "@/lib/paywallExperiment";

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

const EXPERIMENT_COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 365,
  path: "/",
  sameSite: "lax",
} as const;

/**
 * Assigns, on first visit, the variant of each running experiment: the
 * "Aha moment" A/B test (lib/ab.ts) and the paywall presentation test
 * (lib/paywallExperiment.ts). The two draws are independent. A no-op once
 * both cookies exist; an existing assignment is never redrawn.
 *
 * A new assignment is written twice: on the response, so the browser keeps
 * it, and on the request forwarded to the page, so the render of this very
 * request already reads it. Without the second write, a visitor whose first
 * request is /result/[id] (a link opened in another browser, for instance)
 * was rendered with the default variant while their cookie -- and so every
 * event they sent -- said the other one.
 */
function assignExperiments(req: NextRequest): NextResponse {
  const assignments: { name: string; value: string }[] = [];

  const ab = req.cookies.get(AB_COOKIE_NAME)?.value;
  if (ab !== "A" && ab !== "B") {
    assignments.push({ name: AB_COOKIE_NAME, value: Math.random() < 0.5 ? "A" : "B" });
  }
  if (!isPaywallVariant(req.cookies.get(PAYWALL_COOKIE_NAME)?.value)) {
    assignments.push({ name: PAYWALL_COOKIE_NAME, value: drawPaywallVariant() });
  }

  if (assignments.length === 0) return NextResponse.next();

  for (const { name, value } of assignments) req.cookies.set(name, value);
  const res = NextResponse.next({ request: { headers: req.headers } });
  for (const { name, value } of assignments) res.cookies.set(name, value, EXPERIMENT_COOKIE_OPTIONS);
  return res;
}

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/admin")) {
    return adminAuth(req);
  }
  return assignExperiments(req);
}

export const config = {
  // /admin/* for the Basic Auth gate; everything else except API routes
  // and static assets for the experiment cookie assignment.
  matcher: ["/admin/:path*", "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
