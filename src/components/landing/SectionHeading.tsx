import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";

// Editorial section header used across the landing: a numbered mono label,
// a large serif title (wrap the emphasised words in <em>), and an optional
// description. "split" puts the description beside the title on desktop.
export function SectionHeading({
  index,
  label,
  title,
  description,
  align = "left",
  layout = "stack",
  className,
}: {
  index: string;
  label: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  layout?: "stack" | "split";
  className?: string;
}) {
  const centered = align === "center";
  // "left" headings are centred below lg (phones, tablets) and left-aligned
  // from lg, so the desktop layout is unchanged.
  return (
    <Reveal
      className={cn(
        layout === "split" ? "grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-end lg:gap-16" : "",
        centered ? "text-center" : "text-center lg:text-left",
        className
      )}
    >
      <div>
        <div className={cn("label-mono flex items-center gap-3 text-muted-2", centered ? "justify-center" : "justify-center lg:justify-start")}>
          <span className="text-accent">{index}</span>
          <span aria-hidden className="h-px w-8 bg-border" />
          <span>{label}</span>
        </div>
        <h2
          className={cn(
            "text-display mt-5 text-balance text-[2.6rem] text-foreground sm:text-[3.4rem] lg:text-[4.1rem]",
            "[&_em]:text-accent",
            centered ? "mx-auto max-w-3xl" : "mx-auto max-w-3xl lg:mx-0 lg:max-w-none"
          )}
        >
          {title}
        </h2>
      </div>
      {description && (
        <p
          className={cn(
            "text-pretty text-base leading-relaxed text-muted sm:text-lg",
            layout === "split" ? "max-w-md lg:pb-2" : "mt-5 max-w-xl",
            centered ? "mx-auto" : "mx-auto lg:mx-0"
          )}
        >
          {description}
        </p>
      )}
    </Reveal>
  );
}
