"use client";

import { useEffect, useRef } from "react";

/**
 * Fires `onView` the first time the returned ref's element becomes visible
 * in the viewport, then disconnects -- never fires twice for the same
 * mounted instance, regardless of how many times the user scrolls it in
 * and out of view.
 */
export function useInViewOnce<T extends HTMLElement>(onView: () => void) {
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
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
