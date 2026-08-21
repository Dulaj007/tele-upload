"use client";

import { useState } from "react";

/*
  The signature element: a channel with a gate, drawn literally. The walls
  run parallel while a file is moving freely, pinch hard at the download
  gate, then open again on the far side. A pulse travels the channel, crawls
  through the pinch, and warms from cyan to amber as it crosses from machine
  to person.

  Hovering a node explains that stage. The colour is not decoration — cyan is
  everything we control, amber is everything Telegram delivers.
*/

type Node = {
  x: number;
  label: string;
  tone: "ice" | "sodium";
  title: string;
  body: string;
};

const NODES: Node[] = [
  {
    x: 120,
    label: "Sign up",
    tone: "ice",
    title: "One link, no forms",
    body: "Open a link, set a password, you're in. No lengthy signup — your account is ready in under a minute.",
  },
  {
    x: 350,
    label: "Upload",
    tone: "ice",
    title: "Send it once",
    body: "Upload your file and you're done. Nothing sits on our servers waiting to be served — we just keep a pointer to it, so there's no size limit to worry about.",
  },
  {
    x: 640,
    label: "Share",
    tone: "sodium",
    title: "Share the link",
    body: "Every file gets an unguessable link the moment you upload it. Whoever opens it waits a few seconds — verified on our end so it can't be skipped — then the file is theirs.",
  },
  {
    x: 880,
    label: "Earn",
    tone: "sodium",
    title: "You get paid",
    body: "Every real download adds to your balance, priced by where in the world it happened. Cash out once you hit the minimum.",
  },
];

export default function ProcessMap() {
  const [active, setActive] = useState(2);
  const node = NODES[active];

  return (
    <div className="w-full">
      <svg
        viewBox="0 0 1000 180"
        className="w-full h-auto"
        role="img"
        aria-label="How a file moves through Tele Upload: sign up, upload, share, earn."
      >
        <defs>
          <linearGradient id="channel" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6BE3F5" stopOpacity="0.85" />
            <stop offset="58%" stopColor="#6BE3F5" stopOpacity="0.7" />
            <stop offset="72%" stopColor="#FFB454" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FFB454" stopOpacity="0.85" />
          </linearGradient>
          <filter id="bloom" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Channel walls. They pinch at the gate, because that is what a sluice is. */}
        <path
          d="M 40 52 L 570 52 C 606 52 606 76 640 76 C 674 76 674 52 710 52 L 960 52"
          fill="none"
          stroke="url(#channel)"
          strokeWidth="1.25"
          opacity="0.55"
        />
        <path
          d="M 40 128 L 570 128 C 606 128 606 104 640 104 C 674 104 674 128 710 128 L 960 128"
          fill="none"
          stroke="url(#channel)"
          strokeWidth="1.25"
          opacity="0.55"
        />

        <line
          x1="40" y1="90" x2="960" y2="90"
          stroke="url(#channel)" strokeWidth="1" opacity="0.35"
          className="wire-dash"
        />

        {/* Gate jaws */}
        <line x1="640" y1="60" x2="640" y2="76" stroke="#FFB454" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
        <line x1="640" y1="104" x2="640" y2="120" stroke="#FFB454" strokeWidth="2" strokeLinecap="round" opacity="0.9" />

        {/* The pulse */}
        <circle r="4" fill="#FFF" className="pulse-tail" opacity="0.25" filter="url(#bloom)" />
        <circle r="3.2" fill="#9FF0FF" className="pulse" filter="url(#bloom)" />

        {NODES.map((n, i) => {
          const on = i === active;
          const colour = n.tone === "ice" ? "#6BE3F5" : "#FFB454";
          return (
            <g
              key={n.label}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              tabIndex={0}
              role="button"
              aria-label={n.title}
              className="cursor-pointer"
              style={{ outline: "none" }}
            >
              <rect x={n.x - 46} y={30} width={92} height={120} fill="transparent" />
              <circle
                cx={n.x} cy={90} r={on ? 8 : 5}
                fill={on ? colour : "#0A0E1A"}
                stroke={colour}
                strokeWidth="1.5"
                filter={on ? "url(#bloom)" : undefined}
                style={{ transition: "r 180ms ease" }}
              />
              <text
                x={n.x} y={38}
                textAnchor="middle"
                fill={on ? colour : "#7A879F"}
                style={{
                  font: "500 11px var(--font-mono), monospace",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  transition: "fill 180ms ease",
                }}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 min-h-[6.5rem] border-t border-line pt-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          {String(active + 1).padStart(2, "0")} / {String(NODES.length).padStart(2, "0")}
        </p>
        <h3
          className="mt-2 font-display text-xl md:text-2xl"
          style={{ color: node.tone === "ice" ? "var(--ice)" : "var(--sodium)" }}
        >
          {node.title}
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{node.body}</p>
      </div>
    </div>
  );
}
