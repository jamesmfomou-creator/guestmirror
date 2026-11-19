"use client";

import { useEffect } from "react";
import { AnalyticsEvent, track } from "@/lib/analytics";

/**
 * Fires one analytics event when mounted.
 *
 * `onceKey`: fire at most once per browser for that key (localStorage), so a
 * page reopened later -- e.g. the post-payment URL `?unlocked=1` bookmarked
 * or reloaded -- does not count the same thing twice. Storage unavailable
 * (private mode, blocked): fires as before, never throws.
 */
export function AnalyticsBeacon({
  event,
  props,
  onceKey,
}: {
  event: AnalyticsEvent;
  props?: Record<string, string | number | boolean>;
  onceKey?: string;
}) {
  useEffect(() => {
    if (onceKey) {
      const key = `gm_once:${event}:${onceKey}`;
      try {
        if (window.localStorage.getItem(key)) return;
        window.localStorage.setItem(key, "1");
      } catch {
        // storage unavailable: fall through and fire
      }
    }
    track(event, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
  return null;
}
