"use client";

import { motion, useReducedMotion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

// Headline that rises in word by word from behind a mask, once, on load.
// Segments marked `em` are set in italic accent. Static with reduced motion.
export function StaggerWords({
  segments,
  className,
  as: Tag = "h1",
  delay = 0,
}: {
  segments: { text: string; em?: boolean }[];
  className?: string;
  as?: "h1" | "h2" | "p";
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const words = segments.flatMap((seg) => seg.text.split(" ").filter(Boolean).map((w) => ({ w, em: seg.em })));
  const label = segments.map((s) => s.text).join(" ");

  return (
    <Tag className={className} aria-label={label}>
      {words.map(({ w, em }, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          <motion.span
            className={em ? "inline-block italic text-accent" : "inline-block"}
            initial={reduced ? false : { y: "105%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 0.85, ease: EASE, delay: delay + i * 0.055 }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 && " "}
        </span>
      ))}
    </Tag>
  );
}
