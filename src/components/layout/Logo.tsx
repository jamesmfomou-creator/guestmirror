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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo.png" alt="" className="h-7 w-7" width={28} height={28} />
      {BRAND_NAME}
    </Link>
  );
}
