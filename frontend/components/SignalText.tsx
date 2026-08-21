"use client";

import { useEffect, useState } from "react";

/*
  Characters resolve out of monospace noise into the display face, like a signal
  locking. Tied to the subject rather than bolted on: this is a transmission
  product, so the headline arrives the way a transmission does.
*/
const NOISE = "!<>-_\\/[]{}—=+*^?#01";

export default function SignalText({
  text,
  className = "",
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const [shown, setShown] = useState(text);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setLocked(true);
      return;
    }

    let frame = 0;
    let raf = 0;
    const total = 34;

    const tick = () => {
      const progress = frame / total;
      setShown(
        text
          .split("")
          .map((ch, i) => {
            if (ch === " ") return " ";
            if (i / text.length < progress) return ch;
            return NOISE[Math.floor(Math.random() * NOISE.length)];
          })
          .join("")
      );
      frame += 1;
      if (frame <= total) {
        raf = window.setTimeout(tick, 34);
      } else {
        setShown(text);
        setLocked(true);
      }
    };

    const start = window.setTimeout(tick, delay);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(raf);
    };
  }, [text, delay]);

  return (
    <span
      className={className}
      style={{
        fontFamily: locked ? undefined : "var(--font-mono), monospace",
        transition: "color 400ms ease",
      }}
    >
      {shown}
    </span>
  );
}
