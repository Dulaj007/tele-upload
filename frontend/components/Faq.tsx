"use client";

import { useState } from "react";

const ITEMS = [
  {
    q: "Do the people I send files to need an account?",
    a: "No. Anyone with your link can wait it out and get the file straight in their chat — no signup, no app to install beyond one they probably already have.",
  },
  {
    q: "How do I actually get paid?",
    a: "Every real download adds to your balance in USD. Once you're over the minimum, request a payout and it goes to your crypto wallet.",
  },
  {
    q: "Is there a minimum before I can withdraw?",
    a: "Yes — small enough to hit quickly, big enough that a payout isn't mostly fees. You'll see the exact number on your earnings page.",
  },
  {
    q: "What stops someone from refreshing their own link to fake downloads?",
    a: "Downloads are checked for automated and repeat traffic before they count, and each visitor only counts once per file in a rolling window.",
  },
  {
    q: "What can I upload, and how big?",
    a: "Pretty much anything — videos, archives, documents. No arbitrary size limit standing between you and a share link.",
  },
  {
    q: "How long does a payout take?",
    a: "Requests are reviewed and sent out, not instant. Think days, not months.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-line border-y border-line">
      {ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 py-5 text-left"
            >
              <span className="font-display text-base text-ink md:text-lg">{item.q}</span>
              <span
                className={`shrink-0 font-mono text-lg text-ice transition-transform duration-200 ${
                  isOpen ? "rotate-45" : ""
                }`}
                aria-hidden
              >
                +
              </span>
            </button>
            {isOpen && (
              <p className="max-w-2xl pb-6 text-sm leading-relaxed text-muted">{item.a}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
