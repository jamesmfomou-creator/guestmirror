import { permanentRedirect } from "next/navigation";

// The compare mode was withdrawn on 2026-11-26 (owner's request): old links
// and bookmarks land on the home page instead of a 404.
export default function ComparePage() {
  permanentRedirect("/");
}
