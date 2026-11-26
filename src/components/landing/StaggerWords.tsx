"use client";

import { Fragment } from "react";
import { motion, useReducedMotion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

// Headline that rises in word by word from behind a mask, once, on load.
// Segments marked `em` are set in the accent colour; `br` starts a segment on
// a new line. Static with reduced motion.
export function StaggerWords({
  segments,
  className,
  as: Tag = "h1",
  delay = 0,
}: {
  segments: { text: string; em?: boolean; br?: boolean }[];
  className?: string;
  as?: "h1" | "h2" | "p";
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const words = segments.flatMap((seg) =>
    seg.text
      .split(" ")
      .filter(Boolean)
      .map((w, j) => ({ w, em: seg.em, br: Boolean(seg.br) && j === 0 }))
  );
  const label = segments.map((s) => s.text).join(" ");

  return (
    <Tag className={className} aria-label={label}>
      {words.map(({ w, em, br }, i) => (
        <Fragment key={i}>
          {br && <br aria-hidden />}
          <span aria-hidden className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <motion.span
              className={em ? "inline-block text-accent" : "inline-block"}
              initial={reduced ? false : { y: "105%" }}
              animate={{ y: "0%" }}
              transition={{ duration: 0.85, ease: EASE, delay: delay + i * 0.055 }}
            >
              {w}
            </motion.span>
          </span>
          {/* The space sits between the masked words, never inside one (an
              inline-block drops its own trailing space). */}
          {i < words.length - 1 && " "}
        </Fragment>
      ))}
    </Tag>
  );
}
