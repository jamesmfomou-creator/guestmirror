"use client";

import { useEffect } from "react";
import { AnalyticsEvent, track } from "@/lib/analytics";

export function AnalyticsBeacon({ event, props }: { event: AnalyticsEvent; props?: Record<string, string | number | boolean> }) {
  useEffect(() => {
    track(event, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
  return null;
}
