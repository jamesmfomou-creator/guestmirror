// Is this pathname the landing page?
//
// The landing is statically prerendered and revalidated (ISR, app/page.tsx).
// On Vercel, a background regeneration renders it under the internal path
// "/index" (its RSC payload then carries c:["","index"]), so usePathname()
// returns "/index" on the server while the browser always reads "/". The
// header compared against "/" only: the regenerated HTML got the non-landing
// links and the browser the landing ones -- React hydration error #418 on the
// production home page. Both spellings mean the landing.
export function isLandingPath(pathname: string | null | undefined): boolean {
  return pathname === "/" || pathname === "/index";
}
