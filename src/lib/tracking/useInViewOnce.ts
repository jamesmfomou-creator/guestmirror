"use client";

import { useEffect, useRef } from "react";

/**
 * Fires `onView` the first time the returned ref's element becomes visible
 * in the viewport, then disconnects -- never fires twice for the same
 * mounted instance, regardless of how many times the user scrolls it in
 * and out of view.
 *
 * `threshold` defaults to 0.4 (unchanged from before, so every existing
 * caller keeps its current behavior) -- pass a lower value for a tall
 * element where requiring 40% of its own height to be on-screen can fail
 * to fire even when a user genuinely reached it. Confirmed on real data:
 * Paywall (several pricing cards, taller than a phone viewport) measured
 * only 14 "paywall_viewed" against 21 explicit clicks on the button that
 * reveals it (variant B) -- a third of people who asked to see it weren't
 * counted as having seen it.
 */
export function useInViewOnce<T extends HTMLElement>(onView: () => void, threshold = 0.4) {
  const ref = useRef<T | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || fired.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !fired.current) {
          fired.current = true;
          onView();
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
