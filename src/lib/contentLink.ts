// Content link (/analyze?promo=<code>&direct=1): a promo code whose reports go
// straight from the listing to the analysis (no profile/email/goal step), for
// making content. Those reports are filed under this internal address.
export const DIRECT_LINK_EMAIL = "contenu@guestmirror.fr";

export function isDirectLinkReport(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === DIRECT_LINK_EMAIL;
}
