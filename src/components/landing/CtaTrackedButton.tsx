"use client";

import { ComponentProps } from "react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";

export function CtaTrackedButton({
  ctaLocation,
  ...props
}: ComponentProps<typeof Button> & { ctaLocation: string }) {
  return (
    <Button
      {...props}
      onClick={() => track("cta_test_clicked", { cta_location: ctaLocation })}
    />
  );
}
