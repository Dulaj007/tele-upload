"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Rate = { country_code: string; cpm_usd: string };

const NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  DE: "Germany", JP: "Japan", FR: "France", NL: "Netherlands", SE: "Sweden",
  SG: "Singapore", BR: "Brazil", IN: "India", PH: "Philippines", NG: "Nigeria",
  LK: "Sri Lanka",
};

const FLAGS: Record<string, string> = {
  US: "🇺🇸", GB: "🇬🇧", CA: "🇨🇦", AU: "🇦🇺", DE: "🇩🇪", JP: "🇯🇵", FR: "🇫🇷",
  NL: "🇳🇱", SE: "🇸🇪", SG: "🇸🇬", BR: "🇧🇷", IN: "🇮🇳", PH: "🇵🇭", NG: "🇳🇬", LK: "🇱🇰",
};

export default function RegionRates() {
  const [rates, setRates] = useState<Rate[] | null>(null);

  useEffect(() => {
    api<Rate[]>("/public/rates?limit=8").then(setRates).catch(() => setRates([]));
  }, []);

  if (!rates || rates.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 pb-8">
      <div className="mb-10 border-b border-line pb-4">
        <h2 className="font-display text-2xl tracking-tight md:text-3xl">Rates by region</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          A sample of what a single download is worth right now, per 1,000 downloads.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-line bg-line sm:grid-cols-4">
        {rates.map((r) => (
          <div key={r.country_code} className="bg-panel/70 px-5 py-5 text-center">
            <p className="text-2xl" aria-hidden>
              {FLAGS[r.country_code] ?? "🌐"}
            </p>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              {NAMES[r.country_code] ?? r.country_code}
            </p>
            <p className="mt-1 font-display text-lg text-ice">
              ${Number(r.cpm_usd).toFixed(2)}
              <span className="text-xs text-muted"> /1k</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
