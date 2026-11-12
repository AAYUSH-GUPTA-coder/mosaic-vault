"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * One gentle reveal on scroll (200ms, ease-out). Content is visible by
 * default; the hidden start state only exists in CSS when JS has run and
 * the visitor has not asked for reduced motion (see globals.css).
 */
export function Reveal({
  className,
  children,
  as: Tag = "div",
}: {
  className?: string;
  children: React.ReactNode;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // All allowed tags share the HTMLElement surface we use here.
  const Element = Tag as "div";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const show = () => el.setAttribute("data-reveal", "in");

    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      show();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          show();
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);

    // Safety net: never leave content hidden.
    const timer = window.setTimeout(show, 1500);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <Element
      ref={ref}
      data-reveal=""
      className={cn(className)}
    >
      {children}
    </Element>
  );
}
