import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 font-semibold tracking-tight text-[17px] text-foreground ${
        className ?? ""
      }`}
    >
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
        {BRAND_NAME[0]}
      </span>
      {BRAND_NAME}
    </Link>
  );
}
