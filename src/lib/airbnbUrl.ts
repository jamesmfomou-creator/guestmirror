/**
 * Pure, dependency-free check shared between the server-side extraction
 * (lib/airbnbExtract.ts) and client-side UX validation (hero form, import
 * step) -- kept in its own tiny module because airbnbExtract.ts pulls in
 * Buffer/fetch usage that shouldn't be bundled into client code.
 */
export function isAirbnbUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return /(^|\.)airbnb\.[a-z.]+$/i.test(url.hostname) || /(^|\.)abnb\.me$/i.test(url.hostname);
  } catch {
    return false;
  }
}
