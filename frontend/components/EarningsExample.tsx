"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Rate = { country_code: string; cpm_usd: string };

const TIERS = [
  { label: "A file you share around", downloads: 1_000 },
  { label: "Something that gets passed on", downloads: 25_000 },
  { label: "A file that really travels", downloads: 250_000 },
];

function money(n: number) {
  if (n < 1) return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function EarningsExample() {
  const [range, setRange] = useState<[number, number] | null>(null);

  useEffect(() => {
    api<Rate[]>("/public/rates?limit=20")
      .then((rates) => {
        if (rates.length === 0) return;
        const values = rates.map((r) => Number(r.cpm_usd));
        setRange([Math.min(...values), Math.max(...values)]);
      })
      .catch(() => {});
  }, []);

  if (!range) return null;
  const [lo, hi] = range;

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
      <div className="mb-10 border-b border-line pb-4">
        <h2 className="font-display text-2xl tracking-tight md:text-3xl">
          What downloads are worth
        </h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Rough numbers, built from our actual per-region rates below — not a promise,
          just the math.
        </p>
      </div>
      <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-3">
        {TIERS.map((t) => (
          <div key={t.label} className="bg-panel/70 p-7">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-sodium">
              {t.downloads.toLocaleString()} downloads
            </p>
            <p className="mt-3 font-display text-2xl text-ink">
              {money((t.downloads / 1000) * lo)} – {money((t.downloads / 1000) * hi)}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.label}, priced by region.</p>
          </div>
        ))}
      </div>
    </section>
  );
}
