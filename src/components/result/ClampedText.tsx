"use client";

import { useEffect, useRef, useState } from "react";

// Shows the first lines of a text, with "Lire la suite" / "Réduire" when it
// is longer. The WHOLE text is always in the page (no server-side cut, no
// rewording): only its display is clamped. The button only appears when the
// text really overflows the clamp at the current width.

export function ClampedText({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    // Measured in the observer's callback (first call on observe, then on
    // every resize): rotating a phone can make a text fit, or stop fitting.
    const ro = new ResizeObserver(() => setOverflows(el.scrollHeight > el.clientHeight + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded]);

  return (
    <div>
      <p ref={ref} className={`${className} ${expanded ? "" : "line-clamp-3"}`}>
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1.5 text-sm font-semibold text-accent-hover underline-offset-4 hover:underline"
        >
          {expanded ? "Réduire" : "Lire la suite"}
        </button>
      )}
    </div>
  );
}
