"use client";

import { useSyncExternalStore } from "react";
import { BLACK_FRIDAY, blackFridayActive, remaining } from "@/lib/blackFriday";

// Pages are prerendered (the landing every hour, /pricing at build), so the
// campaign window is decided in the browser from the real clock.
// Server snapshot = the static switch only: the server HTML and the first
// client render agree (no hydration error); right after hydration the real
// window applies (hidden before the start / after the end).

let ticker: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!ticker) ticker = setInterval(() => listeners.forEach((l) => l()), 1000);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

/** Whether the campaign is on (re-checked every second). */
export function useBlackFridayActive(): boolean {
  return useSyncExternalStore(subscribe, () => blackFridayActive(), () => BLACK_FRIDAY.enabled);
}

/** Seconds-level remaining time as a string key (stable snapshot), null on the server / once over. */
export function useRemainingKey(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      const r = remaining();
      return r ? `${r.d}:${r.h}:${r.m}:${r.s}` : "over";
    },
    () => null
  );
}

export function parseRemainingKey(key: string | null) {
  if (!key || key === "over") return null;
  const [d, h, m, s] = key.split(":").map(Number);
  return { d, h, m, s };
}
