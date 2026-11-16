/** "jeanne.dupont@gmail.com" -> "je•••@gmail.com": enough to recognise one's own address. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, Math.min(2, local.length))}•••@${domain}`;
}
